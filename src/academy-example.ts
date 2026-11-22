import type { AcademyDraft } from "./expansion-contract.js";

// Versioned teaching example. Return a fresh editable draft for each import.
export function academyExample(): AcademyDraft {
  const guide = (command: string, task: string) => `# Your first run

Use Python 3. No packages or accounts are needed. Open a terminal in this assignment folder.

Run: ${command}

The starter raises NotImplementedError on purpose. That first failure confirms that you are running the right file. Edit report.py; keep the supplied checks unchanged. Run the checks after each small change.

${task}

Before writing code, predict one result on paper. After the checks pass, try an input you chose yourself and record the prediction and actual result in your reflection. Passing these checks covers the stated examples; it does not prove every possible input is correct.

If python is not recognized on Windows, try py -3 in its place. The exercise works only with the input types described in the brief; file loading and invalid-input handling are outside this version.
`;
  return {
    title: "A weekly report someone can use",
    audience:
      "Python learners who can write a function, loop over a list, unpack a pair, and use basic dictionary and string operations. No web or data libraries required.",
    outcome:
      "Turn a club's activity records into a readable weekly report, explain how repeated names are handled, and demonstrate an empty week without an error.",
    rightsConfirmed: false,
    learningProject: {
      title: "The club organizer's weekly report",
      problem:
        "A club organizer has handwritten activity minutes. Repeated names make it hard to see each person's contribution, and an empty week still needs a clear report.",
      deliverable:
        "A Python function that converts (name, minutes) records into alphabetically ordered report lines, with checks and a short explanation of one edge case.",
      milestones: [
        {
          lessonIndex: 0,
          title: "Check one total",
          brief: "First make the arithmetic trustworthy before adding names.",
          acceptanceCriteria: [
            "A repeated duration is counted twice; an empty list totals zero.",
          ],
        },
        {
          lessonIndex: 1,
          title: "Keep people separate",
          brief: "Replace one grand total with a total for each named person.",
          acceptanceCriteria: [
            "Non-adjacent records for the same person are combined.",
          ],
        },
        {
          lessonIndex: 2,
          title: "Hand over the report",
          brief:
            "Separate calculation from presentation so the organizer can read the result.",
          acceptanceCriteria: [
            "Names appear alphabetically and an empty week produces an explicit message.",
          ],
        },
      ],
    },
    lessons: [
      {
        chapter: "Make the numbers trustworthy",
        title: "Count every entry once",
        objective:
          "Return the sum of a list of non-negative integer minutes, including an empty list.",
        practice:
          "Implement total_minutes(minutes). Use a loop so you can explain how the running total changes. Do not change the input list.\nExample input: [15, 10, 15]\nExpected result: 40",
        content: `The organizer wants to check a handwritten weekly total. Each entry is one activity duration in whole minutes. Two entries can have the same value; they are still two activities.

Trace [4, 7, 4] before coding. Start at 0. After the first item the running total is 4, after the second it is 11, and after the third it is 15. The useful invariant is: after each iteration, the running total includes exactly the entries visited so far.

For an empty list, there are no iterations. The initial total must therefore also be the correct empty result. Compare that with starting at the first item: what extra case would that choice create?

A common mistake is replacing the running total with the current duration. That passes a one-item example, so a one-item check cannot distinguish it from accumulation. Use at least two unequal values, and predict the answer first.

This version accepts only lists of non-negative integers. We are not reading a file or validating user input yet. After implementing the function, explain why the duplicate 4 must be included twice.`,
        learn: {
          kind: "exercise",
          title: "Reconcile the weekly total",
          minutes: 20,
          prerequisiteLessons: [],
          acceptanceCriteria: [
            "[15, 10, 15] returns 40, counting both 15-minute entries.",
            "An empty list returns the integer 0.",
            "The supplied list has the same contents after the call.",
          ],
          hints: [
            "Write down the running total after each entry. Which value must survive between iterations?",
            "Try [2, 5]. If you get 5, check whether your update replaces the total instead of adding to it.",
            "Trace the empty list: the body never runs. What value should the function have available to return?",
          ],
          reflection:
            "Show a two-entry input that would expose replacement instead of accumulation. Record your predicted result, the actual result and the line you inspected.",
          transferChallenge:
            "The organizer asks for seconds instead of minutes. Keep the input in minutes and return a total in seconds. Decide whether to convert each entry or the final total; demonstrate why both choices should agree.",
          starterFiles: [
            {
              path: "README.md",
              content: guide(
                "python -m unittest -v",
                "Implement total_minutes in report.py. Your result is one integer, not printed text.",
              ),
            },
            {
              path: "report.py",
              content:
                'def total_minutes(minutes):\n    """Return total minutes without changing the list."""\n    # TODO: accumulate each entry, including repeated values.\n    raise NotImplementedError("Write your running total here")\n',
            },
            {
              path: "test_report.py",
              content: `import unittest
from report import total_minutes

class TotalChecks(unittest.TestCase):
    def test_repeated_entries(self):
        self.assertEqual(total_minutes([15, 10, 15]), 40)
    def test_empty_week(self):
        self.assertEqual(total_minutes([]), 0)
    def test_unequal_entries(self):
        self.assertEqual(total_minutes([2, 5]), 7)
    def test_input_unchanged(self):
        entries = [3, 8]
        total_minutes(entries)
        self.assertEqual(entries, [3, 8])
`,
            },
          ],
        },
      },
      {
        chapter: "Make the numbers trustworthy",
        title: "Give each person their own total",
        objective:
          "Combine non-adjacent (name, minutes) records into one dictionary entry per person.",
        practice:
          "Implement summarize(records), returning a dictionary of total minutes by name. Names are case-sensitive strings; minutes are non-negative integers. Leave records unchanged.\nExample input: [('Ada', 15), ('Lin', 10), ('Ada', 5)]\nExpected result: {'Ada': 20, 'Lin': 10}",
        content: `One grand total hides who contributed. Now each record is a pair: a person's name and a duration. Use the name as the dictionary key; the stored value is that person's running total.

Trace [('Mina', 4), ('Sol', 7), ('Mina', 3)]. After the first record, the state is {'Mina': 4}. After the second it is {'Mina': 4, 'Sol': 7}. The last record changes Mina's total to 7 while Sol stays at 7. Equal totals do not mean the people are the same group.

A name might not be in the dictionary yet. Accessing scores['new name'] raises KeyError. As a separate experiment, compare {}.get('Mina', 0) with {'Mina': 4}.get('Mina', 0). Explain when the default is used before incorporating that idea.

The records need not arrive grouped or sorted. A check with two adjacent records for Ada would miss an implementation that resets when the name changes; put another person between them. For no records, return {}. A zero-minute record still identifies a person and must produce an entry.

Treat 'Ada' and 'ada' as distinct names in this version. Automatic normalization would be a new product decision, not a harmless correction.`,
        learn: {
          kind: "exercise",
          title: "Produce a per-person summary",
          minutes: 30,
          prerequisiteLessons: [0],
          acceptanceCriteria: [
            "Non-adjacent Ada records combine to 20 while Lin remains 10.",
            "Empty records return an empty dictionary.",
            "A zero-minute record creates an entry for its person.",
            "Calling summarize does not reorder or remove input records.",
          ],
          hints: [
            "Which part of the record identifies the group, and which part changes its total?",
            "Inspect the dictionary immediately before processing Ada's second record. Which earlier value must still be there?",
            "Try looking up a missing key with get(name, 0) in a separate Python prompt. Compare the first encounter with a repeated name.",
          ],
          reflection:
            "Trace the dictionary after each record in an example where a name reappears later. Identify the check that would fail if its previous total were overwritten.",
          transferChallenge:
            "The organizer also needs the number of activities per person. Sketch the new result shape, write an example with unequal duration and activity count, then add that behavior without changing the meaning of total minutes.",
          starterFiles: [
            {
              path: "README.md",
              content: guide(
                "python -m unittest -v",
                "Implement summarize in report.py. Return a dictionary; do not print the report yet.",
              ),
            },
            {
              path: "report.py",
              content:
                'def summarize(records):\n    """Return {name: total_minutes} from (name, minutes) pairs."""\n    # TODO: retain a separate running total for each person.\n    raise NotImplementedError("Group the records here")\n',
            },
            {
              path: "test_report.py",
              content: `import unittest
from report import summarize

class GroupChecks(unittest.TestCase):
    def test_non_adjacent_person(self):
        self.assertEqual(summarize([('Ada', 15), ('Lin', 10), ('Ada', 5)]), {'Ada': 20, 'Lin': 10})
    def test_empty_week(self):
        self.assertEqual(summarize([]), {})
    def test_zero_and_case(self):
        self.assertEqual(summarize([('Ada', 0), ('ada', 2)]), {'Ada': 0, 'ada': 2})
    def test_input_unchanged(self):
        records = [('Sol', 3), ('Ada', 1)]
        original = list(records)
        summarize(records)
        self.assertEqual(records, original)
`,
            },
          ],
        },
      },
      {
        chapter: "Make the result usable",
        title: "Deliver a report for an empty or busy week",
        objective:
          "Return a readable, alphabetically ordered report from raw records while keeping calculation separate from formatting.",
        practice:
          "Build summarize(records) and render_report(totals) in report.py. Reuse your grouping approach, then return report lines as one string joined with newline characters. For no people return 'No activity this week.'. Use Python's default case-sensitive name ordering.\nExample input: [('Lin', 10), ('Ada', 15), ('Ada', 5)]\nExpected result: Ada: 20 min, followed by a newline, then Lin: 10 min",
        content: `The organizer needs a report they can paste into a weekly message. A dictionary is useful inside a program, but a stable line order makes the human result easier to scan and compare.

Keep two contracts: summarize returns data; render_report returns text. The second function should not need the original records. For {'Sol': 7, 'Mina': 7}, the text is 'Mina: 7 min' on the first line and 'Sol: 7 min' on the second. There is no trailing newline. A zero total is a real entry and should remain visible.

Try sorted({'Sol': 7, 'Mina': 7}) in a Python prompt. It gives keys in order without changing the dictionary. For presentation, format each key and its total, then join the lines with '\\n'. Keep the unit 'min' for every value so grammar is outside this task.

An empty week is a normal state, not an error. The exact message is 'No activity this week.'. Check that branch before constructing ordinary lines. Compare returning the string with printing it: only the returned value can be reused by another part of the program.

Acceptance does not require a website, database, chart or file importer. First deliver this small working report. In your handover, give one example and explain the assumptions about name casing and input types.`,
        learn: {
          kind: "capstone",
          title: "Hand over the weekly report",
          minutes: 45,
          prerequisiteLessons: [0, 1],
          acceptanceCriteria: [
            "Raw records produce the expected two-line report with Ada before Lin.",
            "An empty summary returns exactly 'No activity this week.'.",
            "A zero-minute person appears in the report.",
            "Formatting returns text without changing the totals dictionary or adding a trailing newline.",
          ],
          hints: [
            "Test calculation and presentation separately. Which function owns combining repeated people?",
            "Give render_report a hand-written dictionary first. If this fails, changing summarize cannot fix the formatting.",
            "Compare a list of formatted lines with '\\n'.join(lines). Check repr(result) to see an unwanted trailing newline.",
          ],
          reflection:
            "Show one raw input, its intermediate dictionary and the final text. Explain which function you would change for a new display format, and cite a check that protects the other function.",
          transferChallenge:
            "The organizer wants the most active people first. Change only the presentation rule: descending minutes, alphabetical names for ties. Write a tie example before editing and preserve the empty-week message.",
          starterFiles: [
            {
              path: "README.md",
              content: guide(
                "python -m unittest -v",
                "Implement both functions in report.py. Bring over your own grouping approach from the previous exercise. First verify the dictionary, then format a hand-written dictionary, then connect the two. Handover: include an example report and its assumptions in your reflection.",
              ),
            },
            {
              path: "report.py",
              content:
                'def summarize(records):\n    """Return totals by case-sensitive name; leave records unchanged."""\n    # TODO: bring over your grouping implementation.\n    raise NotImplementedError("Calculate the totals")\n\ndef render_report(totals):\n    """Return ordered report text, or the specified empty-week message."""\n    # TODO: keep formatting separate from calculation.\n    raise NotImplementedError("Format the report")\n',
            },
            {
              path: "test_report.py",
              content: `import unittest
from report import summarize, render_report

class ReportChecks(unittest.TestCase):
    def test_whole_report(self):
        self.assertEqual(render_report(summarize([('Lin', 10), ('Ada', 15), ('Ada', 5)])), 'Ada: 20 min\\nLin: 10 min')
    def test_empty_week(self):
        self.assertEqual(render_report({}), 'No activity this week.')
    def test_zero_is_visible(self):
        self.assertEqual(render_report({'Ada': 0}), 'Ada: 0 min')
    def test_formatting_preserves_data(self):
        totals = {'Sol': 7, 'Mina': 7}
        self.assertEqual(render_report(totals), 'Mina: 7 min\\nSol: 7 min')
        self.assertEqual(list(totals), ['Sol', 'Mina'])
    def test_calculation_boundary(self):
        self.assertEqual(summarize([]), {})
        self.assertEqual(summarize([('Ada', 0), ('ada', 2)]), {'Ada': 0, 'ada': 2})
`,
            },
          ],
        },
      },
    ],
  };
}
