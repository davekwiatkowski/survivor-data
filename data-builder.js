import fs from "fs";
import puppeteer from "puppeteer";

const castUrl = "https://survivor.fandom.com/wiki/List_of_Survivor_contestants";

// Credit: https://jsperf.com/js-camelcase/5
String.prototype.toCamelCase = function () {
  return this.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => {
    if (/\s+/.test(match)) return "";
    return index == 0 ? match.toLowerCase() : match.toUpperCase();
  });
};

const showAllContestants = async (page) => {
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
    const categoryText = await page.evaluate(el => el.innerText, categoryElement);
    categories.push(categoryText.replace(/\n/g, " ").toCamelCase());
  }
  return categories;
};

const getPlayersData = async (page, infoLabels) => {
  const rowsSelector = "#collapsibleTable0 > tbody > tr";
  const playersData = [];

  await showAllContestants(page);

  const rowElements = await page.$$(rowsSelector);

  for (let i = 2; i < rowElements.length; ++i) {
    const rowSelector = `${rowsSelector}:nth-child(${i + 1})`;
    const infoValueElements = await page.$$(`${rowSelector} > *`);
    let playerData = {};
    for (let j = 0; j < infoLabels.length; ++j) {
      const infoValueText = await page.evaluate(el => el.innerText, infoValueElements[j + 1]);
      playerData = { ...playerData, [infoLabels[j]]: infoValueText };
    }
    const imageElement = await page.$(`${rowSelector} .image`);
    const imageSource = await page.evaluate(el => el.href, imageElement);
    playerData = { ...playerData, profilePictureURL: imageSource };
    playersData.push(playerData);
    console.log(`Added data ${i - 1}/${rowElements.length - 2} players.`);
  }

  return playersData;
};

const writeObjectToFile = async (object) => {
  const filePath = "player-data.json";
  const text = `${JSON.stringify(object)}`;

  console.log("Writing data to file...");
  await fs.writeFile(filePath, text, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Wrote to file.");
  });
};

const go = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const infoLables = await getInfoLabels(page);
  const playersData = await getPlayersData(page, infoLables);
  await writeObjectToFile(playersData);
  await browser.close();
};

go();