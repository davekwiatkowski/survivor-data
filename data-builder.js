import fs from "fs";
import puppeteer from "puppeteer";
import cliProgress from "cli-progress";

// Credit: https://jsperf.com/js-camelcase/5
String.prototype.toCamelCase = function () {
  return this.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => {
    if (/\s+/.test(match)) return "";
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
};

let playersCompleted = 0;

const progressBar = new cliProgress.Bar({
  format: "[{bar}] {percentage}% | Time elapsed: {duration}s | Contestants: {value}/{total}",
}, cliProgress.Presets.legacy);

const getHref = el => el.href;
const getInnerText = el => el.innerText;

const combineObjectResultsForPromises = async (promises) => {
  const promiseResults = await Promise.all(promises);
  let combinedObject = {};
  for (let pr of promiseResults) {
    combinedObject = { ...combinedObject, ...pr };
  }
  return combinedObject;
};

const showAllContestants = async (page) => {
  const castUrl = "https://survivor.fandom.com/wiki/List_of_Survivor_contestants";
  const showButtonSelector = "#collapseButton0";
  await page.goto(castUrl);
  await page.waitForSelector(showButtonSelector);
  await page.click(showButtonSelector);
};

const getInfoLabels = async (page) => {
  const tableSelector = "#collapsibleTable0 > tbody";
  const categoriesSelector = `${tableSelector} > tr:nth-child(2) > th`;
  const categories = [];
  await showAllContestants(page);
  await page.waitForSelector(tableSelector);
  const categoryElements = await page.$$(categoriesSelector);
  for (let categoryElement of categoryElements) {
    const categoryText = await page.evaluate(getInnerText, categoryElement);
    categories.push(categoryText.replace(/\n/g, " ").toCamelCase());
  }
  return categories;
};

const getTableColumnData = async (page, infoValueElementsSelector, i, infoLabels) => {
  const selector = `${infoValueElementsSelector}:nth-child(${i + 2})`;
  const infoValueElement = await page.$(selector);
  const infoValueText = await page.evaluate(getInnerText, infoValueElement);
  return { [infoLabels[i]]: infoValueText };
};

const getIconPictureURL = async (page, rowSelector) => {
  const imageElement = await page.$(`${rowSelector} .image`);
  const value = await page.evaluate(getHref, imageElement);
  if (value) {
    return { iconPictureURL: value };
  }
};

const getPlayerTableData = async (page, rowSelector, infoLabels) => {
  const promises = [];
  const infoValueElementsSelector = `${rowSelector} > *`;
  for (let i = 0; i < infoLabels.length; ++i) {
    promises.push(getTableColumnData(page, infoValueElementsSelector, i, infoLabels));
  }
  promises.push(getIconPictureURL(page, rowSelector));
  return await combineObjectResultsForPromises(promises);
};

const goToPlayerPage = async (page, rowSelector) => {
  const playerUrlElement = await page.$(`${rowSelector} > th > a`);
  const playerUrl = await page.evaluate(getHref, playerUrlElement);
  await page.goto(playerUrl);
  await page.waitForSelector("#mw-content-text");
};

const onPlayerTriviaDataEvaluate = () => {
  const selector = "#mw-content-text > ul";
  const uls = document.querySelectorAll(selector);
  for (let ul of uls) {
    let currPrev = ul.previousElementSibling;
    while (!!currPrev) {
      if (currPrev.innerText === "Trivia") {
        const ret = [];
        for (let li of ul.children) {
          ret.push(li.innerText.replace(/\[\d+\]/g, ""));
        }
        return ret;
      }
      currPrev = currPrev.previousElementSibling;
    }
  }
};

const getPlayerTriviaData = async (page) => {
  const value = await page.evaluate(onPlayerTriviaDataEvaluate);
  if (value) {
    return { trivia: value };
  }
};

const onPlayerGenderEvaluate = () => {
  const FEMALE = "Female";
  const MALE = "Male";
  const selector = "header .page-header__categories-links > a";
  const links = document.querySelectorAll(selector);
  for (let l of links) {
    const text = l.innerText;
    if (text.includes(FEMALE)) {
      return FEMALE;
    }
    if (text.includes(MALE)) {
      return MALE;
    }
  }
};

const getPlayerGender = async (page) => {
  const value = await page.evaluate(onPlayerGenderEvaluate);
  if (value) {
    return { gender: value };
  }
};

const onPlayerOccupationEvaluate = () => {
  const selector = "#mw-content-text > aside section > .pi-item > .pi-data-value";
  const elements = document.querySelectorAll(selector);
  for (let el of elements) {
    if (el.previousElementSibling.innerText === "Occupation:") {
      return el.innerText;
    }
  }
};

const getPlayerOccupation = async (page) => {
  const value = await page.evaluate(onPlayerOccupationEvaluate);
  if (value) {
    return { occupation: value };
  }
};

const onPlayerFullPictureURLEvaluate = () => {
  const selector = "#mw-content-text > aside figure > a";
  const element = document.querySelector(selector);
  return element.href;
};

const getPlayerFullPictureURL = async (page) => {
  const value = await page.evaluate(onPlayerFullPictureURLEvaluate);
  if (value) {
    return { fullPictureURL: value };
  }
};

const getPlayerPageData = async (page) => {
  return await combineObjectResultsForPromises([
    getPlayerTriviaData(page),
    getPlayerGender(page),
    getPlayerOccupation(page),
    getPlayerFullPictureURL(page)
  ]);
};

const getPlayerData = async (page, rowsSelector, i, infoLabels) => {
  const rowSelector = `${rowsSelector}:nth-child(${i + 1})`;
  await showAllContestants(page);
  const playerBasicData = await getPlayerTableData(page, rowSelector, infoLabels);
  await goToPlayerPage(page, rowSelector);
  const playerPageData = await getPlayerPageData(page);
  return { ...playerBasicData, ...playerPageData };
};

const getNumberOfPlayers = async (page, firstRowIndex, rowsSelector) => {
  await showAllContestants(page);
  const rowElements = await page.$$(rowsSelector);
  return rowElements.length - firstRowIndex;
}

const getPlayersDataWorker = async (page, pagesToUse, firstRowIndex, totalPlayers, infoLabels, playersData, rowsSelector, pageIndex) => {
  const playersPerPage = (totalPlayers / pagesToUse) | 0;
  const startIndex = firstRowIndex + playersPerPage * pageIndex;
  const endIndex = pageIndex === pagesToUse - 1
    ? firstRowIndex + totalPlayers
    : firstRowIndex + playersPerPage * (pageIndex + 1);
  for (let i = startIndex; i < endIndex; ++i) {
    const playerData = await getPlayerData(page, rowsSelector, i, infoLabels);
    playersData[i - firstRowIndex] = playerData;
    progressBar.update(++playersCompleted);
  }
};

const getPlayersData = async (pages, infoLabels) => {
  const firstRowIndex = 2;
  const rowsSelector = "#collapsibleTable0 > tbody > tr";
  const totalPlayers = await getNumberOfPlayers(pages[0], firstRowIndex, rowsSelector);
  progressBar.start(totalPlayers, 0);
  const playersData = new Array(totalPlayers);
  const pagesToUse = Math.min(pages.length, totalPlayers);
  const promises = [];
  for (let i = 0; i < pagesToUse; ++i) {
    promises.push(getPlayersDataWorker(pages[i], pagesToUse, firstRowIndex, totalPlayers, infoLabels, playersData, rowsSelector, i));
  }
  await Promise.all(promises);
  progressBar.stop();
  return playersData;
};

const writeObjectToFile = async (object) => {
  const filePath = "player-data.json";
  const text = `${JSON.stringify(object)}`;
  await fs.writeFile(filePath, text, (err) => {
    if (err) {
      throw err;
    }
  });
};

const onPageRequest = req => {
  const resourcesToBlock = [
    "image",
    "stylesheet",
    "media",
    "font",
    "texttrack",
    "object",
    "beacon",
    "csp_report",
    "imageset"
  ];
  if (resourcesToBlock.indexOf(req.resourceType()) > 0) {
    req.abort();
  }
  else {
    req.continue();
  }
};

const go = async () => {
  const browser = await puppeteer.launch();
  const pages = [];
  const pagesToUse = 4; // Configure this based on the specifications of your computer
  for (let i = 0; i < pagesToUse; ++i) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", onPageRequest);
    pages.push(page);
  }
  const infoLables = await getInfoLabels(pages[0]);
  const playersData = await getPlayersData(pages, infoLables);
  await writeObjectToFile(playersData);
  await browser.close();
};

go();