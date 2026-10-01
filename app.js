(function () {
  "use strict";

  const STORAGE = {
    learned: "de-learning-learned",
    startDate: "de-learning-start-date",
    readingMode: "de-learning-reading-mode"
  };
  const TERMS_PER_DAY = 5;
  const REVIEW_QUESTIONS = 5;
  const glossary = window.GLOSSARY;

  const entryIds = buildEntryIds(glossary);
  const crossReferences = buildCrossReferences(glossary);

  const todayKey = new Date().toISOString().slice(0, 10);
  const startDate = localStorage.getItem(STORAGE.startDate) || todayKey;
  localStorage.setItem(STORAGE.startDate, startDate);

  let learned = new Set(readList(STORAGE.learned));
  let quizTerms = [];
  let highlighted = null;

  const dayNumber = Math.max(0, daysBetween(startDate, todayKey));
  const dailyTerms = pickDailyTerms(dayNumber);
  const dailyContainer = document.querySelector("#daily-terms");
  const glossaryList = document.querySelector("#glossary-list");
  const quizForm = document.querySelector("#quiz-form");
  const quizQuestions = document.querySelector("#quiz-questions");
  const quizResult = document.querySelector("#quiz-result");
  const searchInput = document.querySelector("#glossary-search");

  document.querySelector("#today-date").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  renderDailyTerms();
  renderGlossary(glossary);
  buildQuiz();
  setReadingMode(localStorage.getItem(STORAGE.readingMode) === "true");

  document.querySelector("#glossary-search").addEventListener("input", function (event) {
    const words = normalise(event.target.value).split(/\s+/).filter(Boolean);
    const matches = glossary.filter(function (item) {
      const searchable = normalise([item.term, item.expansion, item.definition, item.example, item.category].join(" "));
      return words.every(function (word) { return searchable.includes(word); });
    });
    renderGlossary(matches);
  });

  document.querySelector("#reading-mode").addEventListener("click", function () {
    setReadingMode(!document.body.classList.contains("reading-mode"));
  });

  document.querySelector("#new-quiz").addEventListener("click", buildQuiz);

  quizForm.addEventListener("submit", function (event) {
    event.preventDefault();
    let correct = 0;

    quizTerms.forEach(function (item, index) {
      const selected = quizForm.querySelector('input[name="question-' + index + '"]:checked');
      const feedback = document.querySelector("#feedback-" + index);
      const isCorrect = selected && selected.value === item.term;

      if (isCorrect) {
        correct += 1;
        feedback.textContent = "Correct — " + item.term + ".";
        feedback.className = "feedback correct";
      } else {
        feedback.textContent = "The answer is " + item.term + ": " + item.definition;
        feedback.className = "feedback incorrect";
      }
    });

    quizResult.hidden = false;
    quizResult.textContent = "You got " + correct + " out of " + quizTerms.length +
      ". Every attempt strengthens the memory.";
    quizResult.focus();
  });

  function renderDailyTerms() {
    dailyContainer.replaceChildren();
    dailyTerms.forEach(function (item) {
      const card = document.createElement("article");
      card.className = "term-card";

      const heading = document.createElement("h3");
      heading.textContent = item.term;
      card.appendChild(heading);

      if (item.expansion) {
        const expansion = document.createElement("p");
        expansion.className = "expansion";
        expansion.textContent = item.expansion;
        card.appendChild(expansion);
      }

      const definition = document.createElement("p");
      definition.appendChild(linkedText(item.definition, item.term));
      card.appendChild(definition);

      const example = document.createElement("p");
      example.className = "example";
      example.append("Example: ", linkedText(item.example, item.term));
      card.appendChild(example);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.term = item.term;
      updateLearnButton(button);
      button.addEventListener("click", function () {
        if (learned.has(item.term)) {
          learned.delete(item.term);
        } else {
          learned.add(item.term);
        }
        localStorage.setItem(STORAGE.learned, JSON.stringify(Array.from(learned)));
        updateLearnButton(button);
        updateProgress();
        buildQuiz();
      });
      card.appendChild(button);
      dailyContainer.appendChild(card);
    });
    updateProgress();
  }

  function updateLearnButton(button) {
    const isLearned = learned.has(button.dataset.term);
    button.setAttribute("aria-pressed", String(isLearned));
    button.textContent = isLearned ? "Learned ✓" : "Mark as learned";
  }

  function updateProgress() {
    const todayLearned = dailyTerms.filter(function (item) { return learned.has(item.term); }).length;
    document.querySelector("#progress-summary").textContent =
      todayLearned + " of " + TERMS_PER_DAY + " learned today · " + learned.size + " overall";
  }

  function renderGlossary(items) {
    glossaryList.replaceChildren();
    items.forEach(function (item) {
      const details = document.createElement("details");
      details.className = "glossary-item";
      details.id = entryIds.get(item);
      details.tabIndex = -1;

      const summary = document.createElement("summary");
      summary.textContent = item.term + (item.expansion ? " — " + item.expansion : "");
      details.appendChild(summary);

      const definition = document.createElement("p");
      definition.appendChild(linkedText(item.definition, item.term));
      details.appendChild(definition);

      const example = document.createElement("p");
      example.className = "example";
      example.append("Example: ", linkedText(item.example, item.term));
      details.appendChild(example);
      glossaryList.appendChild(details);
    });

    document.querySelector("#result-count").textContent =
      items.length + (items.length === 1 ? " term" : " terms");
    document.querySelector("#no-results").hidden = items.length !== 0;
  }

  function buildQuiz() {
    const learnedTerms = glossary.filter(function (item) {
      return learned.has(item.term);
    });
    const reviewTerms = seededShuffle(learnedTerms, hash(todayKey + learned.size)).slice(0, REVIEW_QUESTIONS);
    quizTerms = dailyTerms.concat(reviewTerms);
    quizQuestions.replaceChildren();

    appendQuizPart("Part 1: Today’s terms", dailyTerms, 0);
    appendQuizPart("Part 2: Everything you have learned so far", reviewTerms, dailyTerms.length);
    quizResult.hidden = true;
  }

  function appendQuizPart(title, items, offset) {
    const heading = document.createElement("h3");
    heading.className = "part-title";
    heading.textContent = title;
    quizQuestions.appendChild(heading);

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Mark a term as learned to add it to this review.";
      quizQuestions.appendChild(empty);
      return;
    }

    items.forEach(function (item, localIndex) {
      const index = offset + localIndex;
      const fieldset = document.createElement("fieldset");
      fieldset.className = "question";

      const legend = document.createElement("legend");
      legend.textContent = (localIndex + 1) + ". Which term matches this meaning? “" + item.definition + "”";
      fieldset.appendChild(legend);

      const distractors = seededShuffle(
        glossary.filter(function (candidate) { return candidate.term !== item.term; }),
        hash(todayKey + item.term)
      ).slice(0, 3);
      const options = seededShuffle([item].concat(distractors), hash(item.term + todayKey + "options"));

      options.forEach(function (option) {
        const label = document.createElement("label");
        label.className = "answer";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "question-" + index;
        input.value = option.term;
        label.append(input, document.createTextNode(option.term + (option.expansion ? " — " + option.expansion : "")));
        fieldset.appendChild(label);
      });

      const unsure = document.createElement("label");
      unsure.className = "answer";
      const unsureInput = document.createElement("input");
      unsureInput.type = "radio";
      unsureInput.name = "question-" + index;
      unsureInput.value = "";
      unsure.append(unsureInput, document.createTextNode("I’m not sure yet"));
      fieldset.appendChild(unsure);

      const feedback = document.createElement("p");
      feedback.id = "feedback-" + index;
      feedback.className = "feedback";
      feedback.setAttribute("aria-live", "polite");
      fieldset.appendChild(feedback);
      quizQuestions.appendChild(fieldset);
    });
  }

  function slugify(value) {
    return normalise(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "term";
  }

  function buildEntryIds(items) {
    const ids = new Map();
    const used = new Set();
    items.forEach(function (item) {
      const base = "glossary-term-" + slugify(item.term);
      let id = base;
      let suffix = 2;
      while (used.has(id)) {
        id = base + "-" + suffix;
        suffix += 1;
      }
      used.add(id);
      ids.set(item, id);
    });
    return ids;
  }

  function buildCrossReferences(items) {
    const byKey = new Map();
    items.forEach(function (item) {
      const key = normalise(item.term);
      if (key && !byKey.has(key)) {
        byKey.set(key, item);
      }
    });

    const keys = Array.from(byKey.keys()).sort(function (first, second) {
      return second.length - first.length || first.localeCompare(second);
    });

    if (keys.length === 0) {
      return { byKey: byKey, pattern: null };
    }

    const pattern = new RegExp(keys.map(escapeRegExp).join("|"), "gi");
    return { byKey: byKey, pattern: pattern };
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isWordCharacter(character) {
    return character !== undefined && /[A-Za-z0-9]/.test(character);
  }

  // Builds a fragment where every mentioned glossary term becomes an internal link.
  function linkedText(value, currentTerm) {
    const text = typeof value === "string" ? value : "";
    const fragment = document.createDocumentFragment();

    if (!crossReferences.pattern || text === "") {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    const pattern = crossReferences.pattern;
    const currentKey = currentTerm ? normalise(currentTerm) : "";
    let lastIndex = 0;
    let match;

    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const start = match.index;
      const end = start + matched.length;

      if (matched.length === 0) {
        pattern.lastIndex += 1;
        continue;
      }

      const key = normalise(matched);
      const entry = crossReferences.byKey.get(key);
      const boundedStart = !isWordCharacter(text[start - 1]);
      const boundedEnd = !isWordCharacter(text[end]);

      if (entry && key !== currentKey && boundedStart && boundedEnd) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
        fragment.appendChild(createCrossReference(entry, matched));
        lastIndex = end;
      }

      pattern.lastIndex = end;
    }

    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    return fragment;
  }

  function createCrossReference(entry, label) {
    const id = entryIds.get(entry);
    const link = document.createElement("a");
    link.className = "term-link";
    link.href = "#" + id;
    link.textContent = label;
    link.title = "Go to the glossary entry for " + entry.term;
    link.addEventListener("click", function (event) {
      event.preventDefault();
      openGlossaryEntry(id);
    });
    return link;
  }

  function openGlossaryEntry(id) {
    if (searchInput.value !== "") {
      searchInput.value = "";
      renderGlossary(glossary);
    }

    const target = document.getElementById(id);
    if (!target) {
      return;
    }

    target.open = true;
    if (highlighted && highlighted !== target) {
      highlighted.classList.remove("is-cross-reference-target");
    }
    highlighted = target;
    target.classList.add("is-cross-reference-target");
    target.addEventListener("blur", function handleBlur() {
      target.classList.remove("is-cross-reference-target");
      target.removeEventListener("blur", handleBlur);
      if (highlighted === target) {
        highlighted = null;
      }
    });
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  }

  function pickDailyTerms(day) {
    const start = (day * TERMS_PER_DAY) % glossary.length;
    return Array.from({ length: TERMS_PER_DAY }, function (_, index) {
      return glossary[(start + index) % glossary.length];
    });
  }

  function setReadingMode(enabled) {
    document.body.classList.toggle("reading-mode", enabled);
    const button = document.querySelector("#reading-mode");
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Standard reading" : "Easier reading";
    localStorage.setItem(STORAGE.readingMode, String(enabled));
  }

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter(function (item) { return typeof item === "string"; }) : [];
    } catch (_) {
      return [];
    }
  }

  function normalise(value) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function daysBetween(first, second) {
    return Math.floor((Date.parse(second + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86400000);
  }

  function hash(value) {
    return Array.from(value).reduce(function (result, character) {
      return Math.imul(31, result) + character.charCodeAt(0) | 0;
    }, 7);
  }

  function seededShuffle(items, seed) {
    const result = items.slice();
    let state = seed >>> 0;
    for (let index = result.length - 1; index > 0; index -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const swapIndex = state % (index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }
}());
