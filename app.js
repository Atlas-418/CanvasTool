// Fill this in after deploying the worker (see worker/ and README.md).
const PROXY_URL = "https://canvastool-proxy.twobraincellbeing.workers.dev/";

const DOMAIN_KEY = "canvastool.domain";
const TOKEN_KEY = "canvastool.token";

const tabCourses = document.getElementById("tab-courses");
const tabSettings = document.getElementById("tab-settings");
const panelCourses = document.getElementById("panel-courses");
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

async function loadAssignments(course, listEl) {
  listEl.innerHTML = "<li>Loading assignments...</li>";

  const creds = getSavedCredentials();
  const path = `/api/v1/courses/${course.id}/assignments?order_by=due_at&include[]=submission`;

  let response;
  try {
    response = await canvasFetch(path, creds);
  } catch (err) {
    listEl.innerHTML = "<li>Network error loading assignments.</li>";
    return false;
  }

  if (!response.ok) {
    listEl.innerHTML = `<li>Failed to load assignments (${response.status}).</li>`;
    return false;
  }

  const assignments = await response.json();

  if (!Array.isArray(assignments) || assignments.length === 0) {
    listEl.innerHTML = "<li>No assignments.</li>";
    return true;
  }

  listEl.innerHTML = "";
  for (const assignment of assignments) {
    const status = formatAssignmentStatus(assignment);
    const li = document.createElement("li");
    li.textContent = `${assignment.name} — Due: ${formatDueDate(assignment.due_at)}${status ? ` — ${status}` : ""}`;
    listEl.appendChild(li);
  }
  return true;
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

  const url = `${PROXY_URL}/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=term`;

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
      const enrollment = (course.enrollments && course.enrollments[0]) || {};
      const grade = enrollment.computed_current_grade || enrollment.computed_current_score;
      const gradeText = grade !== undefined && grade !== null ? grade : "—";
      const term = termName;

      const codeSuffix = course.course_code && course.course_code !== course.name
        ? ` (${course.course_code})`
        : "";

      const radioId = `course-view-${course.id}`;

      const listLabel = document.createElement("label");
      listLabel.className = "course-list-item";
      listLabel.htmlFor = radioId;
      listLabel.textContent = `${course.name}${codeSuffix} — Grade: ${gradeText}`;
      const li = document.createElement("li");
      li.appendChild(listLabel);
      ul.appendChild(li);

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "course-view";
      radio.id = radioId;

      const screen = document.createElement("div");
      screen.className = "course-screen";

      const backLink = document.createElement("label");
      backLink.className = "back-link";
      backLink.htmlFor = "course-view-list";
      backLink.textContent = "← Back to Courses";
      screen.appendChild(backLink);

      const heading = document.createElement("h2");
      heading.textContent = course.name;
      screen.appendChild(heading);

      const gradeLine = document.createElement("p");
      gradeLine.textContent = `${term} — Grade: ${gradeText}`;
      screen.appendChild(gradeLine);

      const assignmentList = document.createElement("ul");
      screen.appendChild(assignmentList);

      let loaded = false;
      radio.addEventListener("change", async () => {
        if (radio.checked && !loaded) {
          loaded = await loadAssignments(course, assignmentList);
        }
      });

      panelCourses.appendChild(radio);
      panelCourses.appendChild(screen);
    }
  }
}

loadCourses();
