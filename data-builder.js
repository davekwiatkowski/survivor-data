import fs from "fs";
import puppeteer from "puppeteer";

// Credit: https://jsperf.com/js-camelcase/5
String.prototype.toCamelCase = function () {
  return this.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => {
    if (/\s+/.test(match)) return "";
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
};

const startTime = Date.now();

const getHref = el => el.href;
const getInnerText = el => el.innerText;

const getTimeTag = () => {
  const ms = (Date.now() - startTime);
  const seconds = ms / 1000 | 0;
  const minutes = seconds / 60 | 0;
  const shouldInsert0 = (seconds % 60) < 10;
  return `[${minutes}:${shouldInsert0 ? 0 : ""}${seconds % 60}]`;
};

const cLog = (message) => {
  console.log(`${getTimeTag()} ${message}`);
};

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
    if (ul.previousElementSibling.innerText === "Trivia") {
      const ret = [];
      for (let li of ul.children) {
        ret.push(li.innerText.replace(/\[\d+\]/g, ""));
      }
      return ret;
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

const getPlayersData = async (page, infoLabels) => {
  const rowsSelector = "#collapsibleTable0 > tbody > tr";
  await showAllContestants(page);
  const rowElements = await page.$$(rowsSelector);
  const playersData = [];
  for (let i = 2; i < rowElements.length; ++i) {
    cLog(`Gathering data for player ${i - 1}/${rowElements.length - 1}...`);
    const playerData = await getPlayerData(page, rowsSelector, i, infoLabels);
    playersData.push(playerData);
  }
  return playersData;
};

const writeObjectToFile = async (object) => {
  const filePath = "player-data.json";
  const text = `${JSON.stringify(object)}`;
  cLog(`Writing data to file...`);
  await fs.writeFile(filePath, text, (err) => {
    if (err) {
      throw err;
    }
    cLog(`Wrote to file.`);
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
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", onPageRequest);
  const infoLables = await getInfoLabels(page);
  const playersData = await getPlayersData(page, infoLables);
  await writeObjectToFile(playersData);
  await browser.close();
};

go();