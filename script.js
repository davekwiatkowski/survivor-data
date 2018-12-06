const button = document.querySelector("input.next-question");
const optionsElement = document.querySelector("ul.options");
const bioElement = document.querySelector(".bio");
const scoreElement = document.querySelector(".score");
const statusElement = document.querySelector(".status");
const numOptions = 4;

const random = n => Math.random() * n | 0;

let totalQuestions = 0;
let score = 0;
let gameOver = false;

const fillOptions = () => {
  gameOver = false;

  statusElement.innerHTML = "Pick an answer.";
  statusElement.classList = "status pending";

  const indices = [];

  let gender;
  for (let i = 0; i < numOptions; ++i) {
    let index = random(data.length);
    while (indices.includes(index)
      || !data[index].bio
      || data[index].genderData.gender === "unknown"
      || (!!gender && data[index].genderData.gender !== gender)) {
      index = random(data.length);
    }
    indices.push(index);
    if (!gender) {
      gender = data[index].genderData.gender;
    }
  }

  const localAnswerIndex = random(numOptions);
  const answerIndex = indices[localAnswerIndex];
  const answerName = data[answerIndex].name;

  let bioInnerHTML = data[answerIndex].bio;
  const namePieces = data[answerIndex].name.split(" ");
  for (let piece of namePieces) {
    const regex = new RegExp(piece, 'g');
    bioInnerHTML = bioInnerHTML.replace(regex, "_____");
  }
  bioElement.innerHTML = bioInnerHTML;
  for (child of bioElement.children) {
    if (child.innerHTML.includes("<a")) {
      bioElement.removeChild(child);
    }
  }
  optionsElement.innerHTML = "";
  for (let i = 0; i < numOptions; ++i) {
    const item = document.createElement("li");
    const image = document.createElement("img");
    image.src = data[indices[i]].banner;
    item.appendChild(image);
    item.className = "option";
    item.onclick = () => {
      if (gameOver) return;
      gameOver = true;
      if (localAnswerIndex === i) {
        statusElement.innerHTML = `Correct! It was ${answerName}`;
        statusElement.classList = "status correct";
        ++score;
      } else {
        statusElement.innerHTML = `Incorrect. It was ${answerName}`;
        statusElement.classList = "status incorrect";
      }

      scoreElement.innerHTML = `${score}/${++totalQuestions}`;

      for (let j = 0; j < numOptions; ++j) {
        if (j !== localAnswerIndex) {
          optionsElement.children[j].classList += " remove";
        }
      }
    };
    optionsElement.appendChild(item);
  }
};

scoreElement.innerHTML = score;

fillOptions();
button.onclick = fillOptions;