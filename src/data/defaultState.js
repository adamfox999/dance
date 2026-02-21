// ISTD Grade progression for each discipline
export const GRADE_LEVELS = [
  'Pre-Primary', 'Primary',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Intermediate Foundation', 'Intermediate', 'Advanced 1', 'Advanced 2',
]

// Default app state — Isla's Dance Journey
export const defaultState = {
  settings: {
    dancerName: "Isla",
    themeColor: "#a855f7",
    promptLeadMs: 200,
  },

  // Isla's profile — her personal space
  islaProfile: {
    name: "Isla",
    goals: [],          // { id, text, createdDate, completedDate? }
    currentFocus: null,  // { type: "routine"|"discipline", id }
  },

  // Dance disciplines (Ballet, Tap, Modern)
  disciplines: [
    {
      id: "disc-ballet",
      name: "Ballet",
      icon: "🩰",
      currentGrade: "Grade 1",
      gradeHistory: [],   // { grade, examDate, result, feedback }
      elements: [],       // { id, name, status: "learning"|"confident"|"mastered" }
    },
    {
      id: "disc-tap",
      name: "Tap",
      icon: "👞",
      currentGrade: "Grade 1",
      gradeHistory: [],
      elements: [],
    },
    {
      id: "disc-modern",
      name: "Modern",
      icon: "💃",
      currentGrade: "Grade 1",
      gradeHistory: [],
      elements: [],
    },
  ],

  // Dance routines — each has versioned choreography
  routines: [],

  // Shows / performances / events
  shows: [],

  // Practice sessions / lessons / shows / exams
  sessions: [],

  // Stickers & badges earned
  stickers: [],

  // Practice log for streak tracking (array of date strings)
  practiceLog: [],
}
