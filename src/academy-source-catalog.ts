// Discovery metadata only. No university teaching text, exercises or solutions
// are bundled, fetched, or represented as agent evidence by this catalog.
export type ReferenceCourse = {
  id: string;
  institution: string;
  code: string;
  title: string;
  url: string;
  topics: string[];
  level: "introductory" | "intermediate" | "advanced";
  focus: string;
  checkedOn: string;
  licenseNote: string;
  licenseUrl: string;
};
const mit = "https://ocw.mit.edu/courses/";
const stanford = "https://web.stanford.edu/class/";
type Entry = [
  string,
  string,
  string,
  string[],
  ReferenceCourse["level"],
  string,
];
const groups: [string, Entry[]][] = [
  [
    "MIT",
    [
      [
        "6.0001",
        "Computer Science and Programming in Python",
        mit +
          "6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",
        [
          "python",
          "programming",
          "loops",
          "functions",
          "dictionaries",
          "testing",
        ],
        "introductory",
        "Trace program state, test an explanation with a small input, then change a requirement.",
      ],
      [
        "6.0002",
        "Computational Thinking and Data Science",
        mit +
          "6-0002-introduction-to-computational-thinking-and-data-science-fall-2016/",
        ["python", "data science", "simulation", "probability", "optimization"],
        "intermediate",
        "Connect a computational model to assumptions that can be inspected and tested.",
      ],
      [
        "6.006",
        "Introduction to Algorithms",
        mit + "6-006-introduction-to-algorithms-fall-2011/",
        ["algorithms", "data structures", "graphs", "sorting", "complexity"],
        "intermediate",
        "Pair a correct algorithm with an explanation of its running time and a counterexample to a tempting shortcut.",
      ],
      [
        "6.042J",
        "Mathematics for Computer Science",
        mit + "6-042j-mathematics-for-computer-science-fall-2010/",
        ["discrete mathematics", "proof", "probability", "graphs", "logic"],
        "intermediate",
        "Turn an informal claim into a precise statement with a proof or counterexample.",
      ],
      [
        "6.046J",
        "Design and Analysis of Algorithms",
        mit + "6-046j-design-and-analysis-of-algorithms-spring-2015/",
        ["algorithms", "dynamic programming", "randomization", "complexity"],
        "advanced",
        "Make the learner justify a design choice against competing approaches and explicit constraints.",
      ],
      [
        "6.005",
        "Software Construction",
        mit + "6-005-software-construction-spring-2016/",
        [
          "software engineering",
          "testing",
          "specifications",
          "abstraction",
          "java",
        ],
        "intermediate",
        "Write a contract, test its boundaries and explain how a change affects callers.",
      ],
    ],
  ],
  [
    "Stanford",
    [
      [
        "CS106A",
        "Programming Methodology",
        stanford + "cs106a/",
        ["python", "programming", "decomposition", "loops", "dictionaries"],
        "introductory",
        "Build small functions with clear responsibilities before combining them into a useful program.",
      ],
      [
        "CS106B",
        "Programming Abstractions",
        stanford + "cs106b/",
        ["c++", "recursion", "data structures", "algorithms"],
        "intermediate",
        "Use traces and invariants to explain a recursive or data-structure operation.",
      ],
      [
        "CS103",
        "Mathematical Foundations of Computing",
        stanford + "cs103/",
        ["proof", "logic", "sets", "computability", "complexity"],
        "intermediate",
        "Require a defensible argument, not a pattern-matched answer.",
      ],
      [
        "CS109",
        "Probability for Computer Scientists",
        stanford + "cs109/",
        [
          "probability",
          "statistics",
          "bayes",
          "simulation",
          "machine learning",
        ],
        "intermediate",
        "Compare an analytical prediction with a simulation and discuss why the two differ.",
      ],
      [
        "CS229",
        "Machine Learning",
        "https://cs229.stanford.edu/",
        [
          "machine learning",
          "regression",
          "classification",
          "optimization",
          "statistics",
        ],
        "advanced",
        "Connect assumptions, objective functions and evaluation decisions to a concrete model failure.",
      ],
      [
        "CS231n",
        "Deep Learning for Computer Vision",
        "https://cs231n.stanford.edu/",
        ["deep learning", "computer vision", "neural networks", "optimization"],
        "advanced",
        "Inspect errors and training behavior before proposing a more complex model.",
      ],
      [
        "CS224N",
        "Natural Language Processing with Deep Learning",
        stanford + "cs224n/",
        ["nlp", "deep learning", "language models", "transformers"],
        "advanced",
        "Evaluate representations and model outputs against a clearly stated language task.",
      ],
    ],
  ],
  [
    "Carnegie Mellon",
    [
      [
        "15-112",
        "Fundamentals of Programming and Computer Science",
        "https://www.cs.cmu.edu/~112/",
        ["python", "programming", "testing", "debugging", "decomposition"],
        "introductory",
        "Make robustness and systematic debugging part of the exercise from the start.",
      ],
      [
        "15-122",
        "Principles of Imperative Computation",
        "https://www.cs.cmu.edu/~15122/",
        [
          "imperative programming",
          "contracts",
          "invariants",
          "data structures",
          "c",
        ],
        "intermediate",
        "Explain the invariant that makes each operation safe and correct.",
      ],
      [
        "15-213",
        "Introduction to Computer Systems",
        "https://www.cs.cmu.edu/~213/",
        ["systems", "c", "memory", "assembly", "concurrency", "performance"],
        "intermediate",
        "Relate a program's observed behavior to memory, representation and execution.",
      ],
      [
        "15-445/645",
        "Introduction to Database Systems",
        "https://15445.courses.cs.cmu.edu/fall2026/",
        [
          "databases",
          "sql",
          "storage",
          "indexes",
          "transactions",
          "query optimization",
        ],
        "advanced",
        "Explain an implementation tradeoff using a query, storage layout or concurrency scenario.",
      ],
      [
        "15-451",
        "Design and Analysis of Algorithms",
        "https://www.cs.cmu.edu/~15451/",
        ["algorithms", "proof", "complexity", "optimization"],
        "advanced",
        "Require correctness reasoning and resource analysis alongside the implementation.",
      ],
      [
        "10-301/601",
        "Introduction to Machine Learning",
        "https://www.cs.cmu.edu/~10601/",
        ["machine learning", "classification", "regression", "statistics"],
        "intermediate",
        "State a baseline and evaluate improvement on held-out evidence.",
      ],
    ],
  ],
];
export const academySourceCatalog: ReferenceCourse[] = groups.flatMap(
  ([institution, entries]) =>
    entries.map(([code, title, url, topics, level, focus]) => ({
      id: `${institution}:${code}`,
      institution,
      code,
      title,
      url,
      topics,
      level,
      focus,
      checkedOn: "2026-11-21",
      licenseNote:
        institution === "MIT"
          ? "OCW states CC BY-NC-SA 4.0 with additional terms. Check the specific resource and intended use before adapting."
          : "Public course page. Reuse permission has not been verified; check the specific material and author.",
      licenseUrl:
        institution === "MIT"
          ? "https://ocw.mit.edu/pages/privacy-and-terms-of-use/"
          : "",
    })),
);

export function findReferenceCourses(query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return academySourceCatalog.filter((course) =>
    terms.every((term) =>
      `${course.institution} ${course.code} ${course.title} ${course.topics.join(" ")}`
        .toLowerCase()
        .includes(term),
    ),
  );
}
