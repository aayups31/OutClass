import type {
  CourseBrief,
  CoursePlan,
  CourseLessonAnswer,
} from "../../src/course-workshop-contract";
export const workshopBrief: CourseBrief = {
  title: "A useful weekly activity report",
  audience: "Python learners who know lists and loops",
  startingSkills: ["functions", "loops"],
  outcome: "Produce and explain a tested report",
  deliverable: "A readable weekly activity report",
  constraints: "Python standard library only",
  exclusions: "Web services and deployment",
  hours: 4,
  lessonCount: 3,
  language: "python",
  runtime: "Python 3.12",
};
export const workshopPlan: CoursePlan = {
  rationale:
    "First establish accumulation, then grouping, then a readable handoff.",
  outcomes: [
    {
      id: "calculate",
      description: "Calculate correct totals",
      evidence: "Repeated and empty records pass checks",
    },
    {
      id: "present",
      description: "Present a usable report",
      evidence: "Sorted names and an empty-week message",
    },
  ],
  glossary: [{ term: "record", meaning: "A name and a duration in minutes" }],
  environment: {
    runtime: "Python 3.12",
    dependencies: [],
    setup: ["Install Python 3.12 and open the assignment folder."],
  },
  project: {
    problem: "An organizer needs reliable weekly totals",
    architecture: "Keep accumulation separate from formatting",
    interfaces: [
      "summarize(records) returns totals by name",
      "render(totals) returns report text",
    ],
    finalChecks: [
      "Repeated names accumulate",
      "Empty weeks have a clear message",
    ],
  },
  lessons: [
    {
      id: "total",
      module: "Reliable data",
      title: "Count every duration",
      outcomeIds: ["calculate"],
      teaches: ["accumulation"],
      uses: ["functions", "loops"],
      prerequisiteIds: [],
      minutes: 25,
      milestone: "Calculate one grand total",
    },
    {
      id: "group",
      module: "Reliable data",
      title: "Keep people separate",
      outcomeIds: ["calculate"],
      teaches: ["grouping"],
      uses: ["accumulation"],
      prerequisiteIds: ["total"],
      minutes: 35,
      milestone: "Retain a separate total per person",
    },
    {
      id: "report",
      module: "Useful output",
      title: "Hand over the report",
      outcomeIds: ["present"],
      teaches: ["formatting"],
      uses: ["grouping"],
      prerequisiteIds: ["group"],
      minutes: 45,
      milestone: "Return ordered report lines",
    },
  ],
};
export function writtenLesson(index: number): CourseLessonAnswer {
  const lesson = workshopPlan.lessons[index];
  return {
    lessonId: lesson.id,
    sections: [
      {
        title: "The practical problem",
        body: `The organizer needs ${lesson.milestone.toLowerCase()}. First predict a small result before changing the program.`,
      },
      {
        title: "Reason through the state",
        body: "Start with a neutral value. After each record, retain what earlier records contributed. A repeated duration is still a second activity.",
      },
      {
        title: "Check the boundary",
        body: "Trace the empty input separately. Its loop body never runs, so the starting state must already describe the correct empty result.",
      },
    ],
    workedExamples: [
      {
        problem: "Combine durations [4, 7, 4]",
        steps: [
          "Start the total at zero.",
          "After the first and second entries the totals are 4 and 11.",
          "Include the last 4 again; the final total is 15.",
        ],
        result: "15 minutes",
      },
    ],
    misconceptions: [
      {
        belief: "Equal durations represent the same activity",
        counterexample: "Two separate four-minute sessions total eight minutes",
        diagnosis: "Trace [4,4] and count both records",
      },
    ],
    independentTask:
      "Implement total_minutes(values).\nExample input: [2, 5]\nExpected result: 7",
    transferTask:
      "Keep inputs in minutes but return a total in seconds. Predict the new result before editing.",
    summary: `${lesson.title} turns a small data contract into an observable result.`,
    sourceIds: [],
    assumptions: [
      "Inputs are non-negative integers; file loading is outside this task.",
    ],
    assignment: {
      kind: index === 2 ? "capstone" : "exercise",
      title: lesson.title,
      minutes: lesson.minutes,
      prerequisiteLessons: index ? [index - 1] : [],
      acceptanceCriteria: ["[2,5] returns 7", "Empty input returns zero"],
      hints: [
        "What state must survive each record?",
        "Trace [2,5] and inspect whether the update replaces the earlier total.",
      ],
      reflection:
        "Show an input that exposed a mistake and explain your change.",
      transferChallenge: "Convert the final total into seconds.",
      starterFiles: [
        {
          path: "README.md",
          content:
            "Use Python 3.12. Run python -m unittest -v. Edit report.py and keep the checks unchanged. The starter intentionally fails.",
        },
        {
          path: "report.py",
          content:
            "def total_minutes(values):\n    # TODO: retain the running total\n    raise NotImplementedError()\n",
        },
        {
          path: "test_report.py",
          content:
            "import unittest\nfrom report import total_minutes\nclass Checks(unittest.TestCase):\n    def test_repeated(self): self.assertEqual(total_minutes([2,5,2]),9)\n    def test_empty(self): self.assertEqual(total_minutes([]),0)\n",
        },
      ],
    },
    assessments: [0, 1].map((n) => ({
      id: `${lesson.id}-q${n}`,
      outcomeIds: lesson.outcomeIds,
      kind: n ? "retrieval" : "application",
      prompt: n
        ? "Which empty-list result fits this contract?"
        : "What is the total of two separate four-minute sessions?",
      choices: n ? ["0", "Error"] : ["8", "4"],
      reviewAfterDays: [1, 3, 7],
      remediationLessonIds: [lesson.id],
    })),
    answerKeys: [0, 1].map((n) => ({
      itemId: `${lesson.id}-q${n}`,
      correctChoice: 0,
      rationale: n
        ? "No records contribute any minutes."
        : "Both activities contribute, even when their durations are equal.",
      feedback: [
        "That matches the stated contract.",
        "Trace each record and preserve its contribution.",
      ],
    })),
    instructorSolution:
      "def total_minutes(values):\n    result=0\n    for value in values:\n        result+=value\n    return result\n",
  };
}
