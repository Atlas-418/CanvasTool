// Fill this in after deploying the worker (see worker/ and README.md).
const PROXY_URL = "https://canvastool-proxy.twobraincellbeing.workers.dev/";

const DOMAIN_KEY = "canvastool.domain";
const TOKEN_KEY = "canvastool.token";

const tabCourses = document.getElementById("tab-courses");
const tabSettings = document.getElementById("tab-settings");
const panelCourses = document.getElementById("panel-courses");
const courseViewList = document.getElementById("course-view-list");
const settingsForm = document.getElementById("settings-form");
const domainInput = document.getElementById("domain");
const tokenInput = document.getElementById("token");
const clearButton = document.getElementById("clear-settings");
const statusEl = document.getElementById("status");
const courseList = document.getElementById("course-list");

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem(DOMAIN_KEY, domainInput.value.trim());
  localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  tabCourses.checked = true;
  loadCourses();
});

clearButton.addEventListener("click", () => {
  localStorage.removeItem(DOMAIN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  domainInput.value = "";
  tokenInput.value = "";
  courseList.innerHTML = "";
  clearCourseScreens();
  setStatus("Cleared saved domain and token.");
});

function clearCourseScreens() {
  panelCourses.querySelectorAll(".course-screen:not(#course-screen-list)").forEach((el) => el.remove());
  panelCourses.querySelectorAll('input[name="course-view"]:not(#course-view-list)').forEach((el) => el.remove());
}

// Re-clicking "Courses" while already there is otherwise a no-op — this
// makes it double as a way back out of a course's detail screen, matching
// the "← Back to Courses" link.
tabCourses.addEventListener("change", () => {
  if (tabCourses.checked) courseViewList.checked = true;
});
// Restores the tab's active look once back on the list, whichever way you
// got there (the back link, or re-clicking the tab above).
courseViewList.addEventListener("change", () => {
  if (courseViewList.checked) tabCourses.checked = true;
});

// Navigating to any OTHER top-level tab while a course detail is open needs
// to reset the course view too — otherwise its radio stays checked, and the
// :has() rule in style.css would keep that detail screen showing underneath
// whichever tab you switched to.
document.querySelectorAll('input[name="main-tabs"]').forEach((tab) => {
  if (tab !== tabCourses) {
    tab.addEventListener("change", () => {
      if (tab.checked) courseViewList.checked = true;
    });
  }
});

function setStatus(message) {
  statusEl.textContent = message;
}

function getSavedCredentials() {
  const domain = localStorage.getItem(DOMAIN_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  return domain && token ? { domain, token } : null;
}

function canvasFetch(path, creds) {
  return fetch(`${PROXY_URL}${path}`, {
    headers: {
      "Authorization": `Bearer ${creds.token}`,
      "X-Canvas-Domain": creds.domain,
    },
  });
}

function formatDueDate(dueAt) {
  if (!dueAt) return "No due date";
  return new Date(dueAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAssignmentStatus(assignment) {
  const submission = assignment.submission;
  if (!submission) return "";
  if (submission.workflow_state === "graded") {
    const possible = assignment.points_possible;
    return `Graded: ${submission.score}${possible !== undefined ? `/${possible}` : ""}`;
  }
  if (submission.missing) return "Missing";
  if (submission.workflow_state === "submitted") return "Submitted";
  return "Not submitted";
}

async function fetchAssignments(course, creds) {
  const path = `/api/v1/courses/${course.id}/assignments?order_by=due_at&include[]=submission`;
  const response = await canvasFetch(path, creds);
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

function renderAssignmentList(assignments, listEl) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    listEl.innerHTML = "<li>No assignments.</li>";
    return;
  }
  listEl.innerHTML = "";
  for (const assignment of assignments) {
    const status = formatAssignmentStatus(assignment);
    const li = document.createElement("li");
    li.textContent = `${assignment.name} — Due: ${formatDueDate(assignment.due_at)}${status ? ` — ${status}` : ""}`;
    listEl.appendChild(li);
  }
}

// Total possible points only counts graded assignments — ungraded/future
// work shouldn't drag down a "points earned so far" style stat.
function summarizeAssignments(assignments) {
  let earned = 0;
  let possible = 0;
  let overdue = 0;
  for (const assignment of assignments) {
    const submission = assignment.submission;
    const hasPossible = typeof assignment.points_possible === "number" && assignment.points_possible > 0;
    if (submission && submission.workflow_state === "graded") {
      if (typeof submission.score === "number") earned += submission.score;
      if (hasPossible) possible += assignment.points_possible;
    }
    // Canvas's own "missing" flag doesn't cover the case where a teacher
    // manually grades a zero for unsubmitted work instead of leaving it
    // ungraded — a graded 0/# counts as overdue too.
    const isZeroScored = submission && submission.workflow_state === "graded" && submission.score === 0 && hasPossible;
    if ((submission && submission.missing) || isZeroScored) overdue++;
  }
  return { earned, possible, overdue };
}

// Computed from our own earned/possible ratio rather than Canvas's
// computed_current_grade, so the letter always matches the points shown
// and can be colored consistently.
function letterGrade(percent) {
  if (percent >= 97) return "A+";
  if (percent >= 93) return "A";
  if (percent >= 90) return "A-";
  if (percent >= 87) return "B+";
  if (percent >= 83) return "B";
  if (percent >= 80) return "B-";
  if (percent >= 77) return "C+";
  if (percent >= 73) return "C";
  if (percent >= 70) return "C-";
  if (percent >= 67) return "D+";
  if (percent >= 63) return "D";
  if (percent >= 60) return "D-";
  return "F";
}

function gradeColorClass(letter) {
  const first = letter.charAt(0);
  if (first === "A" || first === "B") return "grade-good";
  if (first === "C") return "grade-mid";
  return "grade-bad";
}

// Course names on this instance follow "<subject> - <teacher last name>",
// e.g. "ENG030AD Creative Writing - Jenkins". Walk back from the end to the
// last " - " and split there, so the display name doesn't redundantly repeat
// the teacher we already show on its own line. The parsed teacher segment is
// only a last-name fallback for when the teachers API field is empty — it
// never has a first name to offer, unlike the API.
function splitCourseName(name) {
  const idx = name.lastIndexOf(" - ");
  if (idx === -1) return { displayName: name, teacherRaw: "" };
  return { displayName: name.slice(0, idx).trim(), teacherRaw: name.slice(idx + 3).trim() };
}

// The "class code" shown on a card isn't a separate field (course_code
// duplicates the name here) — it's the leading word of the display name
// itself, e.g. "TCH468" in "TCH468 CompTia A+ Core 2". Single-word names
// like "Homeroom" have no such prefix, so leave those alone rather than
// splitting off the only word there is.
function splitLeadingCode(name) {
  const words = name.split(/\s+/);
  if (words.length < 2) return { codePrefix: "", rest: name };
  return { codePrefix: words[0], rest: words.slice(1).join(" ") };
}

async function loadCourses() {
  const creds = getSavedCredentials();
  if (!creds) {
    tabSettings.checked = true;
    return;
  }
  domainInput.value = creds.domain;

  setStatus("Loading courses...");
  courseList.innerHTML = "";
  clearCourseScreens();

  const url = `${PROXY_URL}/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=term&include[]=teachers`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "X-Canvas-Domain": creds.domain,
      },
    });
  } catch (err) {
    setStatus("Network error reaching the proxy. Is PROXY_URL in app.js set correctly?");
    return;
  }

  if (response.status === 401 || response.status === 403) {
    setStatus("Canvas rejected the request. Double-check your domain and token in Settings.");
    return;
  }

  if (!response.ok) {
    setStatus(`Request failed (${response.status}).`);
    return;
  }

  const courses = await response.json();

  if (!Array.isArray(courses) || courses.length === 0) {
    setStatus("No active courses found.");
    return;
  }

  setStatus("Loading assignments...");

  const assignmentsByCourseId = new Map();
  await Promise.all(courses.map(async (course) => {
    try {
      assignmentsByCourseId.set(course.id, await fetchAssignments(course, creds));
    } catch (err) {
      assignmentsByCourseId.set(course.id, null);
    }
  }));

  setStatus("");

  const termGroups = new Map();
  for (const course of courses) {
    const term = course.term || {};
    const termName = term.name || "No term";
    if (!termGroups.has(termName)) {
      termGroups.set(termName, { startAt: term.start_at, endAt: term.end_at, courses: [] });
    }
    termGroups.get(termName).courses.push(course);
  }

  const sortedTermNames = [...termGroups.keys()].sort((a, b) => {
    const groupA = termGroups.get(a);
    const groupB = termGroups.get(b);
    const startDiff = new Date(groupB.startAt || 0) - new Date(groupA.startAt || 0);
    if (startDiff !== 0) return startDiff;
    return new Date(groupB.endAt || 0) - new Date(groupA.endAt || 0);
  });

  for (const termName of sortedTermNames) {
    const termHeading = document.createElement("h3");
    termHeading.textContent = termName;
    courseList.appendChild(termHeading);

    const ul = document.createElement("ul");
    courseList.appendChild(ul);

    for (const course of termGroups.get(termName).courses) {
      const codeSuffix = course.course_code && course.course_code !== course.name
        ? ` (${course.course_code})`
        : "";
      const { displayName, teacherRaw } = splitCourseName(course.name);
      const { codePrefix, rest: nameRest } = splitLeadingCode(displayName);
      // Prefer the full name from the teachers API (the course-name suffix
      // only ever has a last name); fall back to the parsed one if a course
      // has no teacher data for some reason.
      const teacherApiName = (course.teachers && course.teachers[0] && course.teachers[0].display_name) || "";
      const teacherName = teacherApiName || teacherRaw;

      const assignments = assignmentsByCourseId.get(course.id);
      const summary = assignments ? summarizeAssignments(assignments) : null;

      let gradeLabel = "—";
      let gradeColor = "";
      if (summary && summary.possible > 0) {
        const percent = (summary.earned / summary.possible) * 100;
        gradeLabel = letterGrade(percent);
        gradeColor = gradeColorClass(gradeLabel);
      }

      const radioId = `course-view-${course.id}`;

      const listLabel = document.createElement("label");
      listLabel.className = "course-card";
      listLabel.htmlFor = radioId;

      const top = document.createElement("div");
      top.className = "course-card-top";
      // Only added when there's actually a leading code to show — an empty
      // span here still eats a flex `gap` before the name, throwing off its
      // left alignment relative to the row below.
      if (codePrefix) {
        const codeSpan = document.createElement("span");
        codeSpan.className = "course-card-code";
        codeSpan.textContent = codePrefix;
        top.appendChild(codeSpan);
      }
      const nameSpan = document.createElement("span");
      nameSpan.className = "course-card-name";
      nameSpan.textContent = nameRest;
      const gradeSpan = document.createElement("span");
      gradeSpan.className = `course-card-grade ${gradeColor}`;
      gradeSpan.textContent = gradeLabel;
      top.append(nameSpan, gradeSpan);
      listLabel.appendChild(top);

      const mid = document.createElement("div");
      mid.className = "course-card-mid";
      const teacherSpan = document.createElement("span");
      teacherSpan.className = "course-card-teacher";
      teacherSpan.textContent = teacherName;
      mid.appendChild(teacherSpan);
      listLabel.appendChild(mid);

      // Points and overdue are both assignment-derived stats, grouped
      // together at the bottom rather than points sitting up in the mid
      // row. Always shown, even at zero/no-data, so a card's layout doesn't
      // shift depending on whether it has graded work yet.
      const bottom = document.createElement("div");
      bottom.className = "course-card-bottom";

      const hasOverdue = summary && summary.overdue > 0;
      const overdueSpan = document.createElement("span");
      overdueSpan.className = hasOverdue ? "course-card-overdue" : "course-card-overdue course-card-overdue-none";
      overdueSpan.textContent = `Overdue: ${summary ? summary.overdue : "—"}`;
      bottom.appendChild(overdueSpan);

      const pointsSpan = document.createElement("span");
      pointsSpan.className = "course-card-points";
      pointsSpan.textContent = summary && summary.possible > 0 ? `${summary.earned}/${summary.possible}` : "0/-";
      bottom.appendChild(pointsSpan);

      listLabel.appendChild(bottom);

      const li = document.createElement("li");
      li.appendChild(listLabel);
      ul.appendChild(li);

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "course-view";
      radio.id = radioId;
      radio.addEventListener("change", () => {
        if (radio.checked) tabCourses.checked = false;
      });

      const screen = document.createElement("div");
      screen.className = "course-screen";

      const backLink = document.createElement("label");
      backLink.className = "back-link";
      backLink.htmlFor = "course-view-list";
      backLink.textContent = "← Back to Courses";
      screen.appendChild(backLink);

      const heading = document.createElement("h2");
      heading.textContent = `${displayName}${codeSuffix}`;
      screen.appendChild(heading);

      const gradeLine = document.createElement("p");
      gradeLine.textContent = `${termName}${teacherName ? ` — ${teacherName}` : ""} — Grade: ${gradeLabel}`;
      screen.appendChild(gradeLine);

      const assignmentList = document.createElement("ul");
      if (assignments) {
        renderAssignmentList(assignments, assignmentList);
      } else {
        assignmentList.innerHTML = "<li>Failed to load assignments.</li>";
      }
      screen.appendChild(assignmentList);

      panelCourses.appendChild(radio);
      panelCourses.appendChild(screen);
    }
  }
}

loadCourses();
