import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Field, FieldGroup } from "@workspace/ui/components/field";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRight, Check, Link2, Printer, Shuffle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { Pitch } from "@/components/pitch";
import type { Plan, Section } from "@/lib/lineup";
import {
  POSITIONS,
  POSITION_LABELS,
  GK_SECTION_WEIGHT,
  SECTIONS_PER_HALF,
  TOTAL_SECTIONS,
  generatePlan,
  randomSeed,
  validatePlanInput,
} from "@/lib/lineup";
import roster from "./roster";

export function meta() {
  return [{ title: "Soccer Roster — 7v7 rotation planner" }];
}

export default function Home() {
  // The whole setup lives in the URL, so a plan can be pasted to a co-coach and
  // come back identical on their screen.
  const [searchParams, setSearchParams] = useSearchParams();

  const seedParam = Number(searchParams.get("plan"));
  const seed = Number.isSafeInteger(seedParam) && seedParam > 0 ? seedParam : 1;

  const playersParam = searchParams.get("players");
  const presentPlayers =
    playersParam === null
      ? roster
      : roster.filter((player) => playersParam.split(",").includes(player));

  // Start on a fixed seed so the first paint is identical everywhere, then roll
  // a fresh one — but only when the link didn't already carry a plan.
  useEffect(() => {
    if (searchParams.has("plan")) return;
    updateParams({ plan: String(randomSeed()) });
    // Only ever fires for a link that arrived without a plan number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateParams(patch: Record<string, string | null>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  // Fall back gracefully when a chosen goalie is unchecked or picked twice.
  const firstGoaliePick = searchParams.get("gk1") ?? roster[0] ?? "";
  const secondGoaliePick = searchParams.get("gk2") ?? roster[1] ?? "";
  const firstHalfGoalie = presentPlayers.includes(firstGoaliePick)
    ? firstGoaliePick
    : (presentPlayers[0] ?? "");
  const secondHalfGoalie =
    presentPlayers.includes(secondGoaliePick) &&
    secondGoaliePick !== firstHalfGoalie
      ? secondGoaliePick
      : (presentPlayers.find((player) => player !== firstHalfGoalie) ?? "");

  const problems = validatePlanInput({
    players: presentPlayers,
    firstHalfGoalie,
    secondHalfGoalie,
  });

  const plan = useMemo<Plan | null>(() => {
    if (problems.length > 0) return null;
    return generatePlan({
      players: presentPlayers,
      firstHalfGoalie,
      secondHalfGoalie,
      seed,
    });
    // presentPlayers is rebuilt each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    presentPlayers.join(","),
    firstHalfGoalie,
    secondHalfGoalie,
    seed,
    problems.length,
  ]);

  /** Everything the plan depends on, spelled out so the link stands alone. */
  function shareUrl() {
    const params = new URLSearchParams({
      plan: String(seed),
      players: presentPlayers.join(","),
      gk1: firstHalfGoalie,
      gk2: secondHalfGoalie,
    });
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?${params}`;
  }

  function setPresent(players: string[]) {
    updateParams({ players: players.join(",") });
  }

  function togglePlayer(player: string, present: boolean) {
    setPresent(
      present
        ? roster.filter(
            (name) => name === player || presentPlayers.includes(name)
          )
        : presentPlayers.filter((name) => name !== player)
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6 lg:flex-row">
        <Sidebar
          presentPlayers={presentPlayers}
          onTogglePlayer={togglePlayer}
          onSetAll={(all) => setPresent(all ? roster : [])}
          firstHalfGoalie={firstHalfGoalie}
          secondHalfGoalie={secondHalfGoalie}
          onPickFirstGoalie={(player) => updateParams({ gk1: player })}
          onPickSecondGoalie={(player) => updateParams({ gk2: player })}
          onRandomize={() => updateParams({ plan: String(randomSeed()) })}
          seed={seed}
          shareUrl={shareUrl}
          canShare={problems.length === 0}
        />

        <main className="min-w-0 flex-1">
          {plan ? (
            <PlanView plan={plan} />
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-sm">
              <h2 className="mb-2 font-medium">
                Not enough to build a lineup yet
              </h2>
              <ul className="list-inside list-disc text-muted-foreground">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
      <BuildStamp />
    </div>
  );
}

/** Which commit this bundle came from, so a deploy can be identified on sight. */
function BuildStamp() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-6 pb-4 text-xs text-muted-foreground">
      build{" "}
      {__BUILD__.url ? (
        <a
          className="font-mono underline-offset-2 hover:underline"
          href={__BUILD__.url}
          target="_blank"
          rel="noreferrer"
        >
          {__BUILD__.ref}
        </a>
      ) : (
        <span className="font-mono">{__BUILD__.ref}</span>
      )}
    </footer>
  );
}

interface SidebarProps {
  presentPlayers: string[];
  onTogglePlayer: (player: string, present: boolean) => void;
  onSetAll: (all: boolean) => void;
  firstHalfGoalie: string;
  secondHalfGoalie: string;
  onPickFirstGoalie: (player: string) => void;
  onPickSecondGoalie: (player: string) => void;
  onRandomize: () => void;
  seed: number;
  shareUrl: () => string;
  canShare: boolean;
}

function Sidebar({
  presentPlayers,
  onTogglePlayer,
  onSetAll,
  firstHalfGoalie,
  secondHalfGoalie,
  onPickFirstGoalie,
  onPickSecondGoalie,
  onRandomize,
  seed,
  shareUrl,
  canShare,
}: SidebarProps) {
  return (
    <aside className="w-full shrink-0 lg:w-72 print:hidden">
      <div className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div>
          <h1 className="text-lg font-semibold">Rotation planner</h1>
          <p className="text-sm text-muted-foreground">
            7v7 &middot; {TOTAL_SECTIONS} sections &middot; {SECTIONS_PER_HALF}{" "}
            per half
          </p>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onRandomize}>
            <Shuffle /> Randomize
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Print plan"
            onClick={() => window.print()}
          >
            <Printer />
          </Button>
        </div>
        <div className="-mt-1 flex flex-col gap-2">
          <CopyLinkButton shareUrl={shareUrl} disabled={!canShare} />
          <p className="text-xs text-muted-foreground">
            Plan #{seed} &mdash; the link carries the plan number, who&rsquo;s
            present, and both goalies, so a co-coach opens the same rotation.
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Goalies</h2>
          <GoaliePicker
            label="First half"
            value={firstHalfGoalie}
            options={presentPlayers}
            onChange={onPickFirstGoalie}
          />
          <GoaliePicker
            label="Second half"
            value={secondHalfGoalie}
            options={presentPlayers.filter(
              (player) => player !== firstHalfGoalie
            )}
            onChange={onPickSecondGoalie}
          />
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              Present{" "}
              <span className="text-muted-foreground">
                ({presentPlayers.length} of {roster.length})
              </span>
            </h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={() => onSetAll(true)}>
                All
              </Button>
              <Button variant="ghost" size="xs" onClick={() => onSetAll(false)}>
                None
              </Button>
            </div>
          </div>
          <FieldGroup className="gap-2">
            {roster.map((player) => (
              <Field key={player} orientation="horizontal">
                <Checkbox
                  id={player}
                  name={player}
                  checked={presentPlayers.includes(player)}
                  onCheckedChange={(checked) =>
                    onTogglePlayer(player, Boolean(checked))
                  }
                />
                <Label htmlFor={player}>{player}</Label>
              </Field>
            ))}
          </FieldGroup>
        </div>
      </div>
    </aside>
  );
}

function CopyLinkButton({
  shareUrl,
  disabled,
}: {
  shareUrl: () => string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard needs a secure context; fall back for plain http on a phone.
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" disabled={disabled} onClick={copy}>
      {copied ? <Check /> : <Link2 />}
      {copied ? "Link copied" : "Copy link to this plan"}
    </Button>
  );
}

function GoaliePicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (player: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 && <option value="">No one available</option>}
        {options.map((player) => (
          <option key={player} value={player}>
            {player}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlanView({ plan }: { plan: Plan }) {
  const halves = [1, 2] as const;
  return (
    <div className="flex flex-col gap-8">
      {halves.map((half) => {
        const sections = plan.sections.filter(
          (section) => section.half === half
        );
        return (
          <section key={half} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold">
                {half === 1 ? "First" : "Second"} half
              </h2>
              <span className="text-sm text-muted-foreground">
                in goal: {sections[0].lineup.GK}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {sections.map((section) => (
                <SectionCard key={section.index} section={section} />
              ))}
            </div>
          </section>
        );
      })}

      <SectionGrid plan={plan} />
      <PlayingTime plan={plan} />
    </div>
  );
}

function SectionCard({ section }: { section: Section }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border p-3 print:break-inside-avoid">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Section {section.sectionInHalf}</h3>
        <span className="text-xs text-muted-foreground">
          {section.index + 1} of {TOTAL_SECTIONS}
        </span>
      </header>
      <Pitch lineup={section.lineup} highlight={section.changedPositions} />
      <div className="min-h-8 text-xs">
        {section.subs.length === 0 ? (
          <p className="text-muted-foreground">
            {section.index === 0 ? "Starting lineup" : "No changes"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {section.subs.map((sub) => (
              <li key={sub.position} className="flex items-center gap-1">
                <span className="w-6 shrink-0 text-[10px] text-muted-foreground">
                  {sub.position}
                </span>
                <span className="truncate text-muted-foreground">
                  {sub.out}
                </span>
                <span className="sr-only">comes off for</span>
                <ArrowRight
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="truncate font-medium text-emerald-700 dark:text-emerald-400">
                  {sub.in}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {section.bench.length > 0 && (
        <p className="border-t pt-2 text-xs text-muted-foreground">
          Resting: {section.bench.join(", ")}
        </p>
      )}
    </article>
  );
}

/** The whole game on one grid — the version worth printing and clipping to a board. */
function SectionGrid({ plan }: { plan: Plan }) {
  return (
    <section className="flex flex-col gap-3 print:break-before-page">
      <h2 className="text-base font-semibold">Whole game at a glance</h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-2 text-left font-medium">Position</th>
              {plan.sections.map((section) => (
                <th
                  key={section.index}
                  className={cn(
                    "p-2 text-left font-medium whitespace-nowrap",
                    section.sectionInHalf === 1 &&
                      section.index > 0 &&
                      "border-l"
                  )}
                >
                  H{section.half} &middot; {section.sectionInHalf}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((position) => (
              <tr key={position} className="border-b last:border-0">
                <th className="p-2 text-left font-medium whitespace-nowrap">
                  {POSITION_LABELS[position]}
                </th>
                {plan.sections.map((section) => (
                  <td
                    key={section.index}
                    className={cn(
                      "p-2 whitespace-nowrap",
                      section.sectionInHalf === 1 &&
                        section.index > 0 &&
                        "border-l",
                      section.changedPositions.includes(position) &&
                        "font-medium"
                    )}
                  >
                    {section.lineup[position]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/30">
              <th className="p-2 text-left font-medium">Resting</th>
              {plan.sections.map((section) => (
                <td
                  key={section.index}
                  className={cn(
                    "p-2 align-top text-xs text-muted-foreground",
                    section.sectionInHalf === 1 &&
                      section.index > 0 &&
                      "border-l"
                  )}
                >
                  {section.bench.length > 0
                    ? section.bench.map((player) => (
                        <div key={player}>{player}</div>
                      ))
                    : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlayingTime({ plan }: { plan: Plan }) {
  return (
    <section className="flex flex-col gap-3 print:break-inside-avoid">
      <div>
        <h2 className="text-base font-semibold">Playing time</h2>
        <p className="text-sm text-muted-foreground">
          A half in goal counts as {GK_SECTION_WEIGHT} sections when balancing
          time, so keepers show a higher total here on purpose.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2 font-medium">Player</th>
              <th className="p-2 font-medium">Sections</th>
              <th className="p-2 font-medium">Goalie</th>
              <th className="p-2 font-medium">Defense</th>
              <th className="p-2 font-medium">Forward</th>
              <th className="p-2 font-medium">Resting</th>
            </tr>
          </thead>
          <tbody>
            {plan.summary.map((row) => (
              <tr key={row.player} className="border-b last:border-0">
                <td className="p-2 font-medium">{row.player}</td>
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">
                      {row.sectionsPlayed} / {TOTAL_SECTIONS}
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${(row.sectionsPlayed / TOTAL_SECTIONS) * 100}%`,
                        }}
                      />
                    </span>
                  </span>
                </td>
                <td className="p-2 tabular-nums">{row.gk}</td>
                <td className="p-2 tabular-nums">{row.defense}</td>
                <td className="p-2 tabular-nums">{row.forward}</td>
                <td className="p-2 text-muted-foreground tabular-nums">
                  {row.bench}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
