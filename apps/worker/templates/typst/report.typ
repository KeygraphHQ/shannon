// =============================================================================
// Security Assessment Report — Typst template
// Invoke:
//   typst compile --root <root> --input data=/data.json report.typ out.pdf
// Optional overrides:
//   --input tester=<name>  --input brand=<name>
// =============================================================================

#let data = json(sys.inputs.data)

// Top-level discriminator. Schema variants in report-output-schema.ts:
//   exploits → ExploitsReportData (exploit=true runs, full reproduction)
//   findings → FindingsReportData (exploit=false runs, analysis-only)
#let mode = data.at("mode", default: "exploits")

#let tester-override = sys.inputs.at("tester", default: "Shannon")
#let brand = sys.inputs.at("brand", default: "Shannon | AI Pentester by Keygraph")

// ---------- Palette ---------------------------------------------------------
// Kept distinct so Critical / High are not confused under monitor gamma.
#let sev-color(level) = {
  if level == "Critical" { rgb("#DC2626") }        // red-600
  else if level == "High" { rgb("#EA580C") }       // orange-600
  else if level == "Medium" { rgb("#D97706") }     // amber-600
  else if level == "Low" { rgb("#2563EB") }        // blue-600
  else { rgb("#6B7280") }
}

#let confidence-color(c) = {
  if c == "High" { rgb("#15803D") }    // green-700
  else if c == "Medium" { rgb("#D97706") } // amber-600
  else if c == "Low" { rgb("#6B7280") }   // gray-500
  else { rgb("#6B7280") }
}

// Warm, editorial, high-contrast document palette.
#let ink = rgb("#141414")          // warm near-black text
#let muted = rgb("#5C5850")        // warm gray-brown labels
#let tertiary = rgb("#9A958D")     // lightest muted
#let rule = rgb("#E6E1D9")         // warm hair rules
#let rule-soft = rgb("#D9D3CA")
#let code-bg = rgb("#F6F1EB")      // warm eggshell
#let alt-bg = rgb("#EBE6DF")
#let page-bg = white

// ---------- Page setup ------------------------------------------------------
#set document(title: "Security Assessment Report", author: brand)

#set page(
  paper: "a4",
  margin: (top: 2.2cm, bottom: 2.2cm, left: 2.2cm, right: 2.2cm),
  fill: page-bg,
  header: context {
    if counter(page).get().first() > 1 [
      #set text(size: 8.5pt, fill: muted)
      #grid(columns: (1fr, auto),
        [Security Assessment Report],
        [CONFIDENTIAL],
      )
      #v(-4pt)
      #line(length: 100%, stroke: 0.3pt + rule)
    ]
  },
  footer: context {
    if counter(page).get().first() > 1 [
      #set text(size: 8.5pt, fill: muted)
      #line(length: 100%, stroke: 0.3pt + rule)
      #v(2pt)
      #grid(columns: (1fr, auto),
        [#data.meta.assessmentDate],
        [#counter(page).display() / #context counter(page).final().first()],
      )
    ]
  },
)

#set text(size: 10.5pt, fill: ink)
#set par(leading: 0.7em, justify: false)

#show heading.where(level: 1): it => [
  #pagebreak(weak: true)
  #v(4pt)
  #set text(size: 24pt, weight: "bold", fill: ink)
  #it.body
  #v(4pt)
  #line(length: 100%, stroke: 0.4pt + rule)
  #v(10pt)
]
#show heading.where(level: 2): it => [
  #v(10pt)
  #set text(size: 14pt, weight: "semibold", fill: ink)
  #it.body
  #v(2pt)
]
#show heading.where(level: 3): it => [
  #v(8pt)
  #set text(size: 11.5pt, weight: "semibold", fill: ink)
  #it.body
  #v(-2pt)
]

#show raw: set text(size: 8.5pt)
#show raw.where(block: false): it => box(
  fill: code-bg,
  inset: (x: 3pt, y: 0pt),
  outset: (y: 2pt),
  radius: 2pt,
  it,
)
#show raw.where(block: true): it => block(
  fill: code-bg,
  stroke: (left: 2pt + rule, rest: none),
  inset: (x: 10pt, y: 8pt),
  width: 100%,
  breakable: true,
  {
    set par(leading: 0.5em, justify: false)
    it
  },
)

// ---------- Helpers ---------------------------------------------------------
#let chip(label, color) = box(
  fill: color,
  inset: (x: 6pt, y: 2pt),
  radius: 2pt,
  text(fill: white, weight: "bold", size: 7.5pt, tracking: 0.3pt, upper(label)),
)

#let categories-in-order = (
  "Authentication",
  "Authorization",
  "XSS",
  "Injection",
  "SSRF",
  "Other",
)

#let sev-chip(level) = chip(level, sev-color(level))
#let confidence-chip(c) = chip(c + " confidence", confidence-color(c))

// Verdict of an exploitative run. Anything but Exploited was never demonstrated, and the chip says
// so wherever the finding appears, so a projected attack is not read as a performed one.
#let status-label(s) = {
  if s == "Exploited" { "Exploited" }
  else if s == "BlockedByConstraints" { "Not exploited — blocked" }
  else if s == "OutOfScope" { "Not exploited — out of scope" }
  else if s == "FalsePositive" { "Ruled out" }
  else if s == "Unstated" { "Not confirmed — no verdict recorded" }
  else { s }
}

#let status-color(s) = {
  if s == "Exploited" { rgb("#B91C1C") }           // red-700
  else if s == "FalsePositive" { rgb("#6B7280") }  // gray-500
  else { rgb("#D97706") }                          // amber-600
}

#let status-chip(s) = chip(status-label(s), status-color(s))

// inline-code renders a string, turning backtick-wrapped spans into
// inline raw. Safe on odd counts — a trailing unclosed backtick is
// emitted as literal text so nothing gets swallowed.
#let inline-code(s) = {
  if type(s) != str { return s }
  let parts = s.split("`")
  if parts.len() == 1 { return parts.at(0) }
  let out = []
  for (i, p) in parts.enumerate() {
    if calc.even(i) {
      out += [#p]
    } else if i == parts.len() - 1 {
      out += [#("`" + p)]
    } else {
      out += raw(p)
    }
  }
  out
}

// prose-block renders a narrative string as paragraphs, splitting on blank
// lines so multi-paragraph prose keeps its breaks. Empty input renders nothing.
#let prose-block(s) = {
  if type(s) != str { return s }
  let out = []
  for chunk in s.split("\n\n") {
    let trimmed = chunk.trim()
    if trimmed != "" {
      out += par(inline-code(trimmed))
    }
  }
  out
}

#let render-items(items) = {
  for item in items {
    if item.kind == "prose" [
      #par(inline-code(item.text))
    ] else if item.kind == "code" [
      #raw(item.block.content, lang: item.block.language, block: true)
    ]
  }
}

// Render step items as a bulleted list; prose items become bullets,
// code items break the list and render as code blocks in between.
#let render-bulleted-items(items) = {
  for item in items {
    if item.kind == "prose" [
      - #inline-code(item.text)
    ] else if item.kind == "code" [
      #raw(item.block.content, lang: item.block.language, block: true)
    ]
  }
}

// Render step items as a numbered list; prose items become enumerated,
// code items break the list and render as code blocks in between.
#let render-numbered-items(items) = {
  for item in items {
    if item.kind == "prose" [
      + #inline-code(item.text)
    ] else if item.kind == "code" [
      #raw(item.block.content, lang: item.block.language, block: true)
    ]
  }
}

// Render an array of strings as a bulleted list with inline-code support.
#let code-list(items) = list(..items.map(inline-code))

#let kv(label, value) = grid(
  columns: (auto, 1fr),
  column-gutter: 14pt,
  row-gutter: 4pt,
  text(fill: muted, size: 9.5pt)[#label],
  value,
)

// ---------- COVER PAGE ------------------------------------------------------
#page(header: none, footer: none)[
  #set align(left)
  #v(3.2cm)

  #let brand-parts = brand.split("|").map(p => p.trim())
  #grid(
    columns: (auto, 1fr),
    column-gutter: 8pt,
    align: (horizon, horizon),
    image("/assets/keygraph-logo.png", width: 1.6cm),
    {
      set par(leading: 0.6em)
      text(size: 11pt, fill: ink, weight: "semibold", tracking: 1.2pt)[
        #upper(brand-parts.at(0))
      ]
      if brand-parts.len() > 1 {
        linebreak()
        text(size: 9pt, fill: muted, weight: "regular")[
          #brand-parts.slice(1).join(" ")
        ]
      }
    }
  )
  #set par(leading: 0.7em)

  #v(1.6cm)
  #set par(leading: 0.4em)
  #text(size: 46pt, weight: "bold", fill: ink)[
    Security\
    Assessment\
    Report
  ]
  #set par(leading: 0.7em)

  #v(1fr)

  #line(length: 100%, stroke: 0.3pt + rule)
  #v(0.6cm)

  #grid(
    columns: (1fr, 1fr),
    column-gutter: 28pt,
    row-gutter: 14pt,
    grid(
      columns: (auto, 1fr),
      column-gutter: 18pt,
      row-gutter: 14pt,
      text(fill: muted, size: 9pt)[Target],      text(size: 10pt)[#inline-code(data.meta.target)],
      text(fill: muted, size: 9pt)[Date],        text(size: 10pt)[#data.meta.assessmentDate],
      ..(if "application" in data.meta and data.meta.application != none {
        (text(fill: muted, size: 9pt)[Application], text(size: 10pt)[#inline-code(data.meta.application)])
      } else { () }),
    ),
    grid(
      columns: (auto, 1fr),
      column-gutter: 18pt,
      row-gutter: 14pt,
      text(fill: muted, size: 9pt)[Tester],         text(size: 10pt)[#tester-override],
      text(fill: muted, size: 9pt)[Classification],
        text(size: 10pt, weight: "semibold")[#data.meta.classification],
    ),
  )

  #v(0.8cm)
  #text(size: 8pt, fill: muted)[
    This document contains sensitive security findings.
    Handle in accordance with your organization's data classification policy.
  ]
]

// ---------- TABLE OF CONTENTS -----------------------------------------------
#outline(title: [Contents], depth: 3, indent: auto)

// ---------- EXECUTIVE SUMMARY -----------------------------------------------
= Executive Summary

#grid(
  columns: (auto, 1fr),
  column-gutter: 20pt,
  row-gutter: 12pt,
  text(fill: muted, size: 10pt)[Target],       text(size: 10.5pt)[#inline-code(data.meta.target)],
  text(fill: muted, size: 10pt)[Date],         text(size: 10.5pt)[#data.meta.assessmentDate],
  ..(if "application" in data.meta and data.meta.application != none {
    (text(fill: muted, size: 10pt)[Application], text(size: 10.5pt)[#inline-code(data.meta.application)])
  } else { () }),
  text(fill: muted, size: 10pt)[Tester],       text(size: 10.5pt)[#tester-override],
)

#v(6pt)

#prose-block(data.executiveSummary)

== Scope

#inline-code(data.scope)

// ---------- NOT ASSESSED ----------------------------------------------------
// Vulnerability classes whose analysis never completed. Called out before any
// findings so an incomplete assessment is not read as a clean one.
#let not-assessed = data.notAssessed

#if not-assessed.len() > 0 [
  == Not Assessed
  #block(
    fill: alt-bg,
    stroke: (left: 3pt + sev-color("High"), rest: none),
    inset: (x: 12pt, y: 10pt),
    width: 100%,
    breakable: true,
    [
      #text(fill: sev-color("High"), weight: "bold", size: 8pt, tracking: 0.5pt)[#upper("Incomplete assessment")]
      #v(4pt)
      The following vulnerability classes were NOT assessed in this run because their analysis
      did not complete. Absence of findings for these classes does not indicate they are clean —
      re-run to assess them.
      #v(4pt)
      #list(
        ..not-assessed.map(c => [
          #text(weight: "semibold")[#c] — analysis did not complete; not assessed.
        ])
      )
    ],
  )
]

// ---------- UNREACHED QUEUE ENTRIES -----------------------------------------
// Queue entries the exploitation phase returned no verdict for. Named before the
// findings so a vulnerability that was never examined is not read as one that
// came back clean.
#let unassessed-entries = data.unassessedQueueEntries

#if unassessed-entries.len() > 0 [
  == Assessment Coverage
  #block(
    fill: alt-bg,
    stroke: (left: 3pt + sev-color("Medium"), rest: none),
    inset: (x: 12pt, y: 10pt),
    width: 100%,
    breakable: true,
    [
      #text(fill: sev-color("Medium"), weight: "bold", size: 8pt, tracking: 0.5pt)[#upper("Coverage gap")]
      #v(4pt)
      The exploitation phase returned no verdict for the queue entries below. They were neither
      confirmed nor ruled out, and their absence from the findings is a gap in coverage rather than
      a clean result. Each one still needs triage.
      #v(4pt)
      #list(
        ..unassessed-entries.map(e => [
          #text(weight: "semibold")[#e.id]#if "vulnerabilityType" in e [ — #inline-code(e.vulnerabilityType)]
        ])
      )
    ],
  )
]

// ---------- BY TYPE ---------------------------------------------------------
#let by-type-entries = if mode == "exploits" { data.exploitedByType } else { data.identifiedByType }
#if mode == "exploits" [
  = Successfully Exploited Vulnerabilities by Type
] else [
  = Identified Vulnerabilities by Type
]

#for entry in by-type-entries [
  == #entry.category
  #if "narrative" in entry and entry.narrative != none [
    #inline-code(entry.narrative)
  ]
  #if "bullets" in entry and entry.bullets != none [
    #list(
      ..entry.bullets.map(b => [
        #text(weight: "semibold")[#b.id] — #inline-code(b.description)
      ])
    )
  ]
]

// ---------- SUMMARY ---------------------------------------------------------
= Summary

#let s = data.summary
#let sev = data.derivedCounts.bySeverity

#let severity-card(label, sev-key, n) = box(
  fill: sev-color(sev-key),
  inset: (x: 8pt, y: 12pt),
  radius: 4pt,
  width: 100%,
  stack(
    dir: ttb,
    spacing: 6pt,
    text(fill: white, weight: "bold", size: 20pt)[#n],
    text(fill: white, size: 8pt, tracking: 0.5pt)[#upper(label)],
  ),
)

// The cards count every vulnerability the run stands behind, exploited or not. Said before they are
// read, so a reader totalling them never takes the total for a count of proven exploits.
#if mode == "exploits" [
  #text(fill: muted, size: 9.5pt)[
    Vulnerabilities carried forward, by severity — exploited and not exploited alike. Findings ruled
    out are excluded; the exploited count is below.
  ]
  #v(8pt)
]

#grid(
  columns: 4,
  column-gutter: 8pt,
  severity-card("Critical", "Critical", sev.Critical),
  severity-card("High", "High", sev.High),
  severity-card("Medium", "Medium", sev.Medium),
  severity-card("Low", "Low", sev.Low),
)

#if mode == "findings" [
  #v(18pt)
  #let cf = data.derivedCounts.byConfidence
  #let confidence-card(label, c-key, n) = box(
    stroke: 0.6pt + confidence-color(c-key),
    inset: (x: 8pt, y: 12pt),
    radius: 4pt,
    width: 100%,
    stack(
      dir: ttb,
      spacing: 6pt,
      text(fill: ink, weight: "bold", size: 20pt)[#n],
      text(fill: confidence-color(c-key), size: 8pt, tracking: 0.5pt)[#upper(label + " confidence")],
    ),
  )

  #grid(
    columns: 3,
    column-gutter: 8pt,
    confidence-card("High", "High", cf.High),
    confidence-card("Medium", "Medium", cf.Medium),
    confidence-card("Low", "Low", cf.Low),
  )
]

#v(14pt)

#if mode == "exploits" [
  #grid(
    columns: (auto, 1fr),
    column-gutter: 14pt,
    row-gutter: 4pt,
    text(fill: muted, size: 10pt)[Total identified],
    text(weight: "semibold")[#s.totalIdentified],
    text(fill: muted, size: 10pt)[Successfully exploited],
    text(weight: "semibold")[#s.successfullyExploited],
  )

  // Everything the run identified without proving. Left out, the totals above read as
  // if every finding had been demonstrated.
  #let by-status = data.derivedCounts.byStatus
  #let unproven-statuses = (
    ("BlockedByConstraints", "identified but not exploited — validation blocked"),
    ("OutOfScope", "identified but not exploited — outside the agreed attack scope"),
    ("Unstated", "identified but not exploited — no verdict recorded"),
    ("FalsePositive", "ruled out — determined not to be a vulnerability"),
  ).filter(entry => by-status.at(entry.at(0), default: 0) > 0)

  #if unproven-statuses.len() > 0 [
    #v(6pt)
    #list(
      ..unproven-statuses.map(entry => [
        #text(weight: "semibold")[#by-status.at(entry.at(0), default: 0)] #entry.at(1)
      ])
    )
  ]
] else [
  #grid(
    columns: (auto, 1fr),
    column-gutter: 14pt,
    row-gutter: 4pt,
    text(fill: muted, size: 10pt)[Total identified],
    text(weight: "semibold")[#s.totalIdentified],
  )
]

#v(8pt)

// The per-category counts follow the status lines above, so they carry a label of their own rather
// than inheriting whichever count the reader saw last.
#let breakdown = if mode == "exploits" { s.exploitedBreakdown } else { s.identifiedBreakdown }
#if breakdown.len() > 0 [
  #text(fill: muted, size: 9.5pt)[
    #if mode == "exploits" [Successfully exploited by category] else [Identified by category]
  ]
  #list(
    ..breakdown.map(c => [
      #text(weight: "semibold")[#c.count] #c.category#if "note" in c and c.note != none [ — #inline-code(c.note)]
    ])
  )
]

#if mode == "exploits" [
  #if "outOfScope" in s and s.outOfScope != none [
    #v(4pt)
    #text(weight: "semibold")[Out of Scope#if "note" in s.outOfScope and s.outOfScope.note != none [ (#s.outOfScope.note)]:] #s.outOfScope.total vulnerabilities
    #if "breakdown" in s.outOfScope and s.outOfScope.breakdown != none [
      #list(
        ..s.outOfScope.breakdown.map(c => [
          #text(weight: "semibold")[#c.count] #c.category#if "note" in c and c.note != none [ — #inline-code(c.note)]
        ])
      )
    ]
  ]

  #if "blockedByConstraints" in s and s.blockedByConstraints != none [
    #v(4pt)
    #text(weight: "semibold")[Blocked by Testing Constraints:] #s.blockedByConstraints.total#if "note" in s.blockedByConstraints and s.blockedByConstraints.note != none [ — #s.blockedByConstraints.note]
  ]
]

== Critical Findings

// Each line carries its own verdict, and a finding that was ruled out is absent — the enumeration
// matches the Critical card above it rather than restating every critical-rated finding as proven.
#if s.criticalFindings.len() > 0 [
  #enum(..s.criticalFindings.map(f => [#inline-code(f)]))
] else [
  #text(fill: muted)[None.]
]

// ---------- FINDINGS OVERVIEW -----------------------------------------------
= Findings Overview

#let show-confidence-col = mode == "findings"

#table(
  columns: (auto, 1fr, auto, auto, auto),
  stroke: none,
  inset: (x: 8pt, y: 7pt),
  align: (left, left, left, center, center),
  fill: (_, row) => if row == 0 { none } else if calc.even(row) { code-bg } else { none },
  table.header(
    text(size: 9.5pt, weight: "semibold")[ID],
    text(size: 9.5pt, weight: "semibold")[Title],
    text(size: 9.5pt, weight: "semibold")[Category],
    text(size: 9.5pt, weight: "semibold")[Severity],
    if show-confidence-col {
      text(size: 9.5pt, weight: "semibold")[Confidence]
    } else {
      text(size: 9.5pt, weight: "semibold")[Status]
    },
  ),
  ..data.findings.map(f => (
    text(weight: "semibold")[#f.id],
    inline-code(f.title),
    text(size: 9.5pt)[#f.category],
    sev-chip(f.severity),
    if show-confidence-col { confidence-chip(f.confidence) } else { status-chip(f.status) },
  )).flatten()
)

// ---------- FINDING RENDER --------------------------------------------------
#let render-finding-summary(f) = [
  #v(8pt)
  #grid(
    columns: (auto, 1fr),
    column-gutter: 18pt,
    row-gutter: 12pt,
    text(fill: muted, size: 9.5pt)[OWASP],    text(size: 10pt)[#inline-code(f.owaspCategory)],
    text(fill: muted, size: 9.5pt)[Location], text(size: 10pt)[#inline-code(f.summary.vulnerableLocation)],
    text(fill: muted, size: 9.5pt)[Overview], text(size: 10pt)[#inline-code(f.summary.overview)],
    text(fill: muted, size: 9.5pt)[Impact],   text(size: 10pt)[#inline-code(f.summary.impact)],
  )
]

#let render-finding-extras(f) = [
  #heading(level: 3, outlined: false)[Remediation]
  #prose-block(f.remediation)

  #if "notes" in f and f.notes != none and f.notes.len() > 0 [
    #heading(level: 3, outlined: false)[Notes]
    #render-bulleted-items(f.notes)
  ]

  #if "additionalSections" in f and f.additionalSections != none [
    #for extra in f.additionalSections [
      #heading(level: 3, outlined: false)[#inline-code(extra.heading)]
      #render-items(extra.items)
    ]
  ]
]

#let render-exploit(f) = [
  // A finding no exploit confirmed keeps its evidence but loses every label that would claim the
  // attack was carried out.
  #let unproven = f.status != "Exploited"

  == #f.id: #inline-code(f.title)
  #sev-chip(f.severity) #h(4pt) #status-chip(f.status)
  #if "confidence" in f and f.confidence != none [ #h(4pt) #confidence-chip(f.confidence)]

  #render-finding-summary(f)

  === Prerequisites
  #inline-code(f.prerequisites)

  #if f.exploitationSteps.len() > 0 [
    === #if unproven [Projected Exploitation Path (not executed)] else [Exploitation Steps]
    #for step in f.exploitationSteps [
      #text(weight: "semibold")[Step #step.number#if "title" in step and step.title != none [ — #inline-code(step.title)]]

      #render-items(step.items)
    ]
  ]

  === #if unproven [Evidence of Vulnerability] else [Proof of Impact]
  #render-numbered-items(f.proofOfImpact)

  #render-finding-extras(f)

  #v(16pt)
]

#let render-analysis(f) = [
  == #f.id: #inline-code(f.title)
  #sev-chip(f.severity) #h(4pt) #confidence-chip(f.confidence)

  #render-finding-summary(f)

  #render-finding-extras(f)

  #v(16pt)
]

#let render-finding(f) = if mode == "exploits" { render-exploit(f) } else { render-analysis(f) }

// ---------- PER-CATEGORY -----------------------------------------------------
// "Exploitation Evidence" is itself a claim. A category no exploit confirmed is titled for what it
// actually holds.
#let category-section-label(cat-findings) = {
  if mode != "exploits" {
    "Findings"
  } else if cat-findings.filter(f => f.status == "Exploited").len() > 0 {
    "Exploitation Evidence"
  } else {
    "Findings"
  }
}

#for cat in categories-in-order {
  let cat-findings = data.findings.filter(f => f.category == cat)
  if cat-findings.len() > 0 [
    = #cat #category-section-label(cat-findings) (#cat-findings.len() #if cat-findings.len() == 1 [finding] else [findings])
    #for f in cat-findings {
      render-finding(f)
    }
  ]
}
