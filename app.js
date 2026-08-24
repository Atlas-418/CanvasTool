// Fill this in after deploying the worker (see worker/ and README.md).
const PROXY_URL = "https://canvastool-proxy.twobraincellbeing.workers.dev/";

const DOMAIN_KEY = "canvastool.domain";
const TOKEN_KEY = "canvastool.token";

const settingsPanel = document.getElementById("settings-panel");
const settingsToggle = document.getElementById("settings-toggle");
const settingsForm = document.getElementById("settings-form");
const domainInput = document.getElementById("domain");
const tokenInput = document.getElementById("token");
const clearButton = document.getElementById("clear-settings");
const statusEl = document.getElementById("status");
const courseList = document.getElementById("course-list");

settingsToggle.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem(DOMAIN_KEY, domainInput.value.trim());
  localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  settingsPanel.hidden = true;
  loadCourses();
});

clearButton.addEventListener("click", () => {
  localStorage.removeItem(DOMAIN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  domainInput.value = "";
  tokenInput.value = "";
  courseList.innerHTML = "";
  setStatus("Cleared saved domain and token.");
  settingsPanel.hidden = false;
});

function setStatus(message) {
  statusEl.textContent = message;
}

function getSavedCredentials() {
  const domain = localStorage.getItem(DOMAIN_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  return domain && token ? { domain, token } : null;
}

async function loadCourses() {
  const creds = getSavedCredentials();
  if (!creds) {
    settingsPanel.hidden = false;
    return;
  }
  domainInput.value = creds.domain;

  setStatus("Loading courses...");
  courseList.innerHTML = "";

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
    settingsPanel.hidden = false;
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
  for (const course of courses) {
    const enrollment = (course.enrollments && course.enrollments[0]) || {};
    const grade = enrollment.computed_current_grade || enrollment.computed_current_score;
    const gradeText = grade !== undefined && grade !== null ? grade : "—";
    const term = (course.term && course.term.name) || "";

    const li = document.createElement("li");
    li.textContent = `${course.name} (${course.course_code}) — ${term} — Grade: ${gradeText}`;
    courseList.appendChild(li);
  }
}

loadCourses();
