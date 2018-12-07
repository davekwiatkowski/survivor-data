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
const getInnerTextWithoutLinks = el => el.innerText.replace(/\[\d+\]/g, "");

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

const getPlayerTriviaData = async (page) => {
  const contentSelector = "#mw-content-text";
  await page.waitForSelector(contentSelector);
  const triviaSelector = `${contentSelector} > ul:last-of-type > li`;
  const triviaElements = await page.$$(triviaSelector);
  const promises = [];
  for (let element of triviaElements) {
    promises.push(page.evaluate(getInnerTextWithoutLinks, element));
  }
  return await Promise.all(promises);
};

const getPlayerData = async (page, rowsSelector, i, infoLabels) => {
  await showAllContestants(page);
  const rowSelector = `${rowsSelector}:nth-child(${i + 1})`;
  const infoValueElementsSelector = `${rowSelector} > *`;
  let playerData = {};
  for (let j = 0; j < infoLabels.length; ++j) {
    const infoValueElement = await page.$(`${infoValueElementsSelector}:nth-child(${j + 2})`);
    const infoValueText = await page.evaluate(getInnerText, infoValueElement);
    playerData = { ...playerData, [infoLabels[j]]: infoValueText };
  }
  const imageElement = await page.$(`${rowSelector} .image`);
  const imageSource = await page.evaluate(getHref, imageElement);
  playerData = { ...playerData, profilePictureURL: imageSource };
  const playerUrlElement = await page.$(`${rowSelector} > th > a`);
  const playerUrl = await page.evaluate(getHref, playerUrlElement);
  await page.goto(playerUrl);
  const trivia = await getPlayerTriviaData(page);
  if (trivia.length > 0) {
    playerData = { ...playerData, trivia };
  }
  return playerData;
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
  const resourcesToBlock = ["image", "stylesheet", "media", "font", "texttrack", "object", "beacon", "csp_report", "imageset"];
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