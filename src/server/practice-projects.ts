import type { Exercise } from "./practice.js";

type Project = Omit<Exercise, "kind" | "requiresPracticals">;
const projects: Project[] = [
  {
    id: "javascript-install-order",
    language: "javascript",
    title: "Plan dependency installation",
    skill: "Graphs and cycle detection",
    minutes: 95,
    function: "installOrder",
    starter:
      'export function installOrder(dependencies) {\n  throw new Error("Not implemented");\n}\n',
    topics: ["graph", "dependency", "project"],
    brief:
      "A workshop installer must order packages so each one is ready before anything that needs it. Work from a map of package names to dependency names.",
    requirements: [
      "Return all package names in install order. When several are ready, choose the lexicographically smallest lowercase ASCII name.",
      "Treat a name mentioned only as a dependency as having no dependencies. Count a repeated dependency once.",
      "Return null when a cycle exists. Document the runtime cost of your approach.",
    ],
    hints: [
      "Draw arrows from dependencies to the packages that need them.",
      "Track how many prerequisites each remaining package still needs.",
    ],
    cases: [
      {
        label: "Install shared dependencies once",
        args: [{ web: ["core", "ui"], worker: ["core"], ui: ["core"] }],
        expected: ["core", "ui", "web", "worker"],
      },
      {
        label: "Ready packages use alphabetical order",
        args: [{ z: [], a: ["base", "base"], b: [] }],
        expected: ["b", "base", "a", "z"],
      },
      {
        label: "A cycle has no installation plan",
        args: [{ a: ["b"], b: ["a"], independent: [] }],
        expected: null,
      },
    ],
  },
  {
    id: "python-inventory-ledger",
    language: "python",
    title: "Reconcile an inventory ledger",
    skill: "State transitions and idempotency",
    minutes: 90,
    function: "reconcile_inventory",
    starter:
      "def reconcile_inventory(opening, entries):\n    raise NotImplementedError()\n",
    topics: ["dictionary", "state", "project"],
    brief:
      "Stock transactions arrive in order but may be retried. Replay the ledger so a retry can’t book the same stock twice.",
    requirements: [
      "Return a dictionary with stock and rejected keys. Each entry has id, sku and integer delta. Start with a copy of opening and treat missing SKUs as zero.",
      "Apply only the first occurrence of each ID, even if it was rejected. Reject any delta that would make stock negative and preserve the order of rejected IDs.",
      "Document where you enforce the duplicate and stock rules.",
    ],
    hints: [
      "Track seen IDs independently of stock and rejections.",
      "Compute a candidate balance before writing anything to the stock map.",
    ],
    cases: [
      {
        label: "A retry cannot apply a transaction twice",
        args: [
          { a: 3 },
          [
            { id: 1, sku: "a", delta: -2 },
            { id: 1, sku: "a", delta: -2 },
            { id: 2, sku: "b", delta: 4 },
          ],
        ],
        expected: { stock: { a: 1, b: 4 }, rejected: [] },
      },
      {
        label: "Rejected transactions still consume their ID",
        args: [
          {},
          [
            { id: 5, sku: "a", delta: -1 },
            { id: 5, sku: "a", delta: 4 },
            { id: 7, sku: "b", delta: -1 },
          ],
        ],
        expected: { stock: {}, rejected: [5, 7] },
      },
      {
        label: "Retain items whose balance reaches zero",
        args: [{ a: 2 }, [{ id: 1, sku: "a", delta: -2 }]],
        expected: { stock: { a: 0 }, rejected: [] },
      },
    ],
  },
  {
    id: "typescript-delivery-planner",
    language: "typescript",
    title: "Schedule deliveries across loading bays",
    skill: "Resource allocation and deterministic scheduling",
    minutes: 90,
    function: "assignBays",
    starter:
      'type Delivery = { id: string; ready: number; duration: number };\n\nexport function assignBays(deliveries: Delivery[], bayCount: number): { id: string; bay: number; start: number; end: number }[] {\n  throw new Error("Not implemented");\n}\n',
    topics: ["sort", "schedule", "project"],
    brief:
      "Several trucks share a depot. Build a scheduler that produces a repeatable queue when trucks arrive together.",
    requirements: [
      "Process deliveries by ready time, preserving input order for ties. Every bay is available at time zero.",
      "Choose the bay yielding the earliest feasible start and break ties by the lowest bay index. Return id, zero-based bay, start and end for each delivery.",
      "Assume bayCount and durations are positive. Keep inputs unchanged and explain how many bays you inspect per delivery.",
    ],
    hints: [
      "Earliest feasible start is the later of the ready time and the bay's availability.",
      "Update only the availability of the bay you selected.",
    ],
    cases: [
      {
        label: "Concurrent deliveries use separate bays",
        args: [
          [
            { id: "a", ready: 0, duration: 5 },
            { id: "b", ready: 0, duration: 2 },
            { id: "c", ready: 1, duration: 3 },
          ],
          2,
        ],
        expected: [
          { id: "a", bay: 0, start: 0, end: 5 },
          { id: "b", bay: 1, start: 0, end: 2 },
          { id: "c", bay: 1, start: 2, end: 5 },
        ],
      },
      {
        label: "Two idle bays tie at the arrival time",
        args: [
          [
            { id: "late", ready: 20, duration: 1 },
            { id: "a", ready: 0, duration: 8 },
          ],
          2,
        ],
        expected: [
          { id: "a", bay: 0, start: 0, end: 8 },
          { id: "late", bay: 0, start: 20, end: 21 },
        ],
      },
      { label: "No deliveries", args: [[], 1], expected: [] },
    ],
  },
  {
    id: "c-record-counter",
    language: "c",
    title: "Scan a stream of length-prefixed records",
    skill: "Bounded parsing and partial records",
    minutes: 80,
    function: "complete_prefix",
    starter:
      "int complete_prefix(const unsigned char *data, int length) {\n    (void)data; (void)length;\n    return -1;\n}\n",
    topics: ["buffer", "binary", "project"],
    brief:
      "A logger receives a chunk that may end in the middle of a record. Find how many bytes are safe for the caller to consume.",
    requirements: [
      "Each record starts with one byte giving the payload length. Return the number of bytes occupied by the complete leading records, including their headers.",
      "Stop before an incomplete record and never read past length. A zero-length payload still occupies one header byte.",
      "Document why the first incomplete record prevents scanning for a later header.",
    ],
    hints: [
      "Keep an offset at the start of the next record.",
      "Compare the payload length against the bytes remaining after the header.",
    ],
    cases: [
      { label: "Ignore a truncated final record", args: [] },
      { label: "A zero-length record still advances", args: [] },
      { label: "An empty chunk consumes nothing", args: [] },
    ],
    nativeChecks: [
      "complete_prefix((unsigned char[]){2,7,8,1,6,3,2}, 7) == 5",
      "complete_prefix((unsigned char[]){0,0,1,9}, 4) == 4",
      "complete_prefix(NULL, 0) == 0",
    ],
  },
  {
    id: "cpp-peak-occupancy",
    language: "cpp",
    title: "Find a venue’s peak occupancy",
    skill: "Sweep line and tie handling",
    minutes: 85,
    function: "peak_occupancy",
    starter:
      "#include <utility>\n#include <vector>\n\nint peak_occupancy(const std::vector<std::pair<int, int>>& stays) {\n    (void)stays;\n    return -1;\n}\n",
    topics: ["sort", "vector", "interval", "project"],
    brief:
      "A venue wants to know its peak traffic. Compute the maximum number of overlapping stays from arrival and departure times.",
    requirements: [
      "Each stay is [arrival, departure) with departure after arrival. An arrival exactly at a departure does not overlap the departing stay.",
      "Return zero for no stays and leave the input unchanged. Aim for O(n log n) time and explain your tie rule.",
    ],
    hints: [
      "Turn each stay into an arrival and a departure event.",
      "When times tie, account for departures before arrivals.",
    ],
    cases: [
      { label: "Touching stays do not overlap", args: [] },
      { label: "Find the peak for nested and overlapping stays", args: [] },
      { label: "No stays means zero occupancy", args: [] },
    ],
    nativeChecks: [
      "peak_occupancy({{1,3}, {3,5}, {5,6}}) == 1",
      "peak_occupancy({{4,9}, {1,10}, {5,7}, {8,12}}) == 3",
      "peak_occupancy({}) == 0",
    ],
  },
];

export const advancedProjects: Exercise[] = projects.map((project) => ({
  ...project,
  kind: "project",
  requiresPracticals: 2,
}));
