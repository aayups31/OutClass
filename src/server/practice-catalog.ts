import type { Exercise } from "./practice.js";

type Task = Omit<Exercise, "starter"> & { signature: string };

const tasks: Task[] = [
  {
    id: "python-stockroom",
    language: "python",
    kind: "practice",
    title: "Find the stock that needs reordering",
    skill: "Dictionaries and filtering",
    minutes: 20,
    function: "reorder",
    signature: "def reorder(stock, minimum):",
    topics: ["dictionary", "loop", "filter", "condition"],
    brief:
      "A community pantry checks inventory each morning. Turn its stock count into the shopping list volunteers can act on.",
    requirements: [
      "Return a dictionary of items below the minimum, with the quantity to buy for each.",
      "An item exactly at the minimum needs no order. Keep the input unchanged.",
    ],
    hints: [
      "Work through one item with one unit left and a minimum of four.",
      "The result stores a difference, so copy only the keys that are below the minimum.",
    ],
    cases: [
      {
        label: "Restock only items below the minimum",
        args: [{ rice: 2, beans: 5, oats: 7 }, 5],
        expected: { rice: 3 },
      },
      {
        label: "Include items with zero available",
        args: [{ tea: 0, oil: 1 }, 3],
        expected: { tea: 3, oil: 2 },
      },
      {
        label: "An empty stockroom yields an empty list",
        args: [{}, 3],
        expected: {},
      },
    ],
  },
  {
    id: "python-shift-audit",
    language: "python",
    kind: "practice",
    title: "Spot duplicate volunteer shifts",
    skill: "Sets and stable ordering",
    minutes: 25,
    function: "duplicate_shifts",
    signature: "def duplicate_shifts(shifts):",
    topics: ["set", "list", "duplicates", "collection"],
    brief:
      "Two coordinators merged sign-up sheets. Flag each duplicate shift once so the team knows what to reconcile.",
    requirements: [
      "Accept a list of case-sensitive shift IDs. Return each repeated ID once, in the order it first repeats.",
      "A third occurrence does not add another result.",
    ],
    hints: [
      "Trace A, B, B, A on paper. The order of first appearances is different from the order of first repeats.",
      "Track the IDs seen so far and the IDs already reported.",
    ],
    cases: [
      {
        label: "Order is based on the first repeat",
        args: [["a", "b", "b", "a"]],
        expected: ["b", "a"],
      },
      {
        label: "Report each repeated ID only once",
        args: [["11", "11", "11"]],
        expected: ["11"],
      },
      {
        label: "Case-sensitive IDs remain distinct",
        args: [["AM", "am"]],
        expected: [],
      },
    ],
  },
  {
    id: "python-room-bookings",
    language: "python",
    kind: "project",
    title: "Consolidate a room’s bookings",
    skill: "Interval merging",
    minutes: 55,
    function: "booked_blocks",
    signature: "def booked_blocks(bookings):",
    topics: ["sorting", "interval", "schedule", "project"],
    brief:
      "A library needs a single timeline from several booking feeds. Produce the blocks when the room is occupied.",
    requirements: [
      "Accept unordered [start, end] pairs in minutes. Return sorted lists of [start, end] pairs.",
      "Merge overlapping or touching bookings, including fully contained bookings. Treat input pairs as valid and leave them unchanged.",
      "Document one boundary example and the runtime cost of your approach.",
    ],
    hints: [
      "Sketch the timeline for [30, 50], [10, 20], [20, 35].",
      "After sorting by start, only the most recent merged block can touch the next booking.",
    ],
    cases: [
      {
        label: "Unordered and touching bookings merge",
        args: [
          [
            [30, 50],
            [10, 20],
            [20, 35],
          ],
        ],
        expected: [[10, 50]],
      },
      {
        label: "Contained bookings preserve the outer end",
        args: [
          [
            [0, 60],
            [10, 20],
            [90, 100],
          ],
        ],
        expected: [
          [0, 60],
          [90, 100],
        ],
      },
      { label: "No bookings yield no blocks", args: [[]], expected: [] },
    ],
  },
  {
    id: "typescript-alert-labels",
    language: "typescript",
    kind: "practice",
    title: "Label alerts from typed events",
    skill: "Discriminated unions",
    minutes: 20,
    function: "alertLabel",
    signature:
      'type Alert = { kind: "delay"; minutes: number } | { kind: "closure"; station: string };\n\nexport function alertLabel(alert: Alert): string',
    topics: ["type", "union", "condition", "function"],
    brief:
      "A transit notice feed has delays and station closures. Turn each variant into the label riders will read.",
    requirements: [
      'Format a delay as "Delay: 12 min" and a closure as "Closed: Museum", substituting the actual minutes or station.',
      "Narrow using the kind field so neither branch needs a type cast.",
    ],
    hints: [
      "Which field exists on every variant?",
      "In the closure branch, only the station field is relevant.",
    ],
    cases: [
      {
        label: "Format a delay",
        args: [{ kind: "delay", minutes: 12 }],
        expected: "Delay: 12 min",
      },
      {
        label: "Format a closure",
        args: [{ kind: "closure", station: "Museum" }],
        expected: "Closed: Museum",
      },
      {
        label: "Zero minutes stays visible",
        args: [{ kind: "delay", minutes: 0 }],
        expected: "Delay: 0 min",
      },
    ],
  },
  {
    id: "typescript-decode-ticket",
    language: "typescript",
    kind: "practice",
    title: "Validate a support ticket payload",
    skill: "Runtime type narrowing",
    minutes: 25,
    function: "decodeTicket",
    signature:
      "export function decodeTicket(value: unknown): { id: string; urgent: boolean } | null",
    topics: ["type", "validation", "unknown", "object"],
    brief:
      "A help desk consumes records from an external feed. Validate the payload before handing it to the queue.",
    requirements: [
      "Return null unless the input is a non-array object with a non-blank string id and boolean urgent.",
      "Trim the id and return only id and urgent. Preserve false as a valid value.",
    ],
    hints: [
      "JavaScript reports null as an object. Handle it before reading properties.",
      "Check the field's type before trimming the id or constructing the typed result.",
    ],
    cases: [
      {
        label: "Normalize a valid ticket without copying unrelated fields",
        args: [{ id: " T-15 ", urgent: false, priority: 7 }],
        expected: { id: "T-15", urgent: false },
      },
      { label: "Reject null", args: [null], expected: null },
      {
        label: "Reject a blank identifier",
        args: [{ id: " ", urgent: true }],
        expected: null,
      },
      {
        label: "Reject numeric urgency",
        args: [{ id: "T-3", urgent: 1 }],
        expected: null,
      },
    ],
  },
  {
    id: "typescript-review-queue",
    language: "typescript",
    kind: "project",
    title: "Sort a review queue by urgency",
    skill: "Typed comparators and stable sorting",
    minutes: 50,
    function: "reviewOrder",
    signature:
      'type Review = { id: string; priority: "urgent" | "normal"; queuedAt: number };\n\nexport function reviewOrder(items: Review[]): string[]',
    topics: ["array", "sort", "type", "project"],
    brief:
      "A small moderation team needs urgent work first and predictable ordering among items of the same urgency.",
    requirements: [
      "Return the review IDs in order: urgent first, then earliest queuedAt within each urgency.",
      "Preserve the input order for ties and avoid mutating the input. Document how your comparator handles all three decisions.",
    ],
    hints: [
      "Write the group rule before comparing timestamps.",
      "Sorting a copy protects callers who still need the original order.",
    ],
    cases: [
      {
        label: "Urgency wins over age",
        args: [
          [
            { id: "a", priority: "normal", queuedAt: 1 },
            { id: "b", priority: "urgent", queuedAt: 7 },
          ],
        ],
        expected: ["b", "a"],
      },
      {
        label: "Earlier work leads within a group and ties stay stable",
        args: [
          [
            { id: "c", priority: "urgent", queuedAt: 7 },
            { id: "z", priority: "urgent", queuedAt: 2 },
            { id: "a", priority: "urgent", queuedAt: 2 },
          ],
        ],
        expected: ["z", "a", "c"],
      },
      { label: "Empty queue", args: [[]], expected: [] },
    ],
  },
];

export const practiceCatalog: Exercise[] = tasks.map(
  ({ signature, ...task }) => ({
    ...task,
    starter:
      task.language === "python"
        ? `${signature}\n    raise NotImplementedError()\n`
        : `${signature} {\n  throw new Error("Not implemented");\n}\n`,
  }),
);

const nativeTasks: (Omit<Exercise, "cases"> & {
  checks: [string, string][];
})[] = [
  {
    id: "c-outage-streak",
    language: "c",
    kind: "practice",
    title: "Measure a sensor’s longest outage",
    skill: "Arrays and counters",
    minutes: 25,
    function: "longest_outage",
    topics: ["array", "pointer", "loop"],
    brief:
      "A monitoring station receives a series of sensor flags. Find the longest period it was offline.",
    requirements: [
      "Return the longest consecutive run of zeroes. Any nonzero flag ends the run.",
      "Read at most count elements. A count of zero returns zero.",
    ],
    hints: [
      "Track the current run and the best run separately.",
      "Check a run that extends to the last element.",
    ],
    starter:
      "int longest_outage(const int *flags, int count) {\n    (void)flags;\n    (void)count;\n    return -1;\n}\n",
    checks: [
      [
        "Include a run ending at the last sample",
        "longest_outage((int[]){1,0,1,0,0,0}, 6) == 3",
      ],
      [
        "Separate outages stay separate",
        "longest_outage((int[]){0,0,3,0}, 4) == 2",
      ],
      ["Empty sample window", "longest_outage(NULL, 0) == 0"],
    ],
  },
  {
    id: "c-packet-boundary",
    language: "c",
    kind: "practice",
    title: "Read a packet’s length safely",
    skill: "Bounds and byte order",
    minutes: 25,
    function: "payload_size",
    topics: ["array", "byte", "binary", "condition"],
    brief:
      "A small data logger uses a two-byte length header. Decode it without reading past a truncated packet.",
    requirements: [
      "Read the first two bytes as an unsigned big-endian length. Return -1 if fewer than two bytes are available or the declared payload exceeds the remaining bytes.",
      "Return the declared length when extra bytes follow the payload.",
    ],
    hints: [
      "Multiply the first byte by 256 before adding the second.",
      "Check the available header length before accessing either byte.",
    ],
    starter:
      "int payload_size(const unsigned char *packet, int count) {\n    (void)packet;\n    (void)count;\n    return -2;\n}\n",
    checks: [
      [
        "Complete payload with a trailing byte",
        "payload_size((unsigned char[]){0,2,8,9,0}, 5) == 2",
      ],
      [
        "Reject a missing second header byte",
        "payload_size((unsigned char[]){0}, 1) == -1",
      ],
      [
        "Read the high byte as part of the length",
        "payload_size((unsigned char[]){1,0,9}, 3) == -1",
      ],
      [
        "Zero-byte payload is valid",
        "payload_size((unsigned char[]){0,0}, 2) == 0",
      ],
    ],
  },
  {
    id: "cpp-search-shelf",
    language: "cpp",
    kind: "practice",
    title: "Locate the first eligible shelf",
    skill: "Binary search in vectors",
    minutes: 25,
    function: "first_shelf",
    topics: ["vector", "binary", "search", "algorithm"],
    brief:
      "Storage shelf capacities are sorted. Choose the smallest shelf that holds an incoming box.",
    requirements: [
      "Return the index of the first capacity at least required, including ties. Return -1 if no shelf qualifies.",
      "Use logarithmic search and leave the vector unchanged.",
    ],
    hints: [
      "A lower bound includes equal values.",
      "When a shelf qualifies, keep searching left for an earlier match.",
    ],
    starter:
      "#include <vector>\n\nint first_shelf(const std::vector<int>& capacities, int required) {\n    (void)capacities;\n    (void)required;\n    return -1;\n}\n",
    checks: [
      ["Return the first exact match", "first_shelf({3,5,5,8}, 5) == 1"],
      ["Find the next capacity between sizes", "first_shelf({3,5,8}, 6) == 2"],
      [
        "Return -1 when the largest shelf is too small",
        "first_shelf({2,3}, 4) == -1",
      ],
      ["Return -1 for an empty inventory", "first_shelf({}, 3) == -1"],
    ],
  },
  {
    id: "cpp-merge-waitlists",
    language: "cpp",
    kind: "practice",
    title: "Merge two venue waitlists",
    skill: "Two-pointer traversal",
    minutes: 30,
    function: "merge_waitlists",
    topics: ["vector", "array", "algorithm", "iterator"],
    brief:
      "Two box offices share a venue. Merge their ordered reservation IDs into one deduplicated list.",
    requirements: [
      "Return ascending IDs from both sorted inputs, with each ID appearing once.",
      "Traverse the lists in linear time and leave them unchanged.",
    ],
    hints: [
      "Compare the next unseen element in each vector.",
      "Before appending, compare the value with the last output ID.",
    ],
    starter:
      "#include <vector>\n\nstd::vector<int> merge_waitlists(const std::vector<int>& first, const std::vector<int>& second) {\n    (void)first;\n    (void)second;\n    return {};\n}\n",
    checks: [
      [
        "Preserve order and deduplicate across lists",
        "(merge_waitlists({1,3,7}, {2,3,5}) == std::vector<int>{1,2,3,5,7})",
      ],
      [
        "Deduplicate within one list",
        "(merge_waitlists({}, {2,2,4}) == std::vector<int>{2,4})",
      ],
      ["Leave empty input empty", "merge_waitlists({}, {}).empty()"],
    ],
  },
];

practiceCatalog.push(
  ...nativeTasks.map(({ checks, ...task }) => ({
    ...task,
    cases: checks.map(([label]) => ({ label, args: [] })),
    nativeChecks: checks.map(([, condition]) => condition),
  })),
);
