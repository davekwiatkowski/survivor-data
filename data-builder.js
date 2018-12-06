import fs from "fs";
import gender from "gender";
import puppeteer from "puppeteer";

const castSectionStart = 3;
const castUrl = "https://www.truedorktimes.com/survivor/cast/";
const filePath = "player-data.js";
const totalSeasons = 37;

let playersData = [];

const writeObjectToFile = async (object) => {
  console.log("Writing data to file...");
  const text = `const data = ${JSON.stringify(object)};`;
  await fs.writeFile(filePath, text, (err) => {
    if (err) {
      console.log(err);
      return;
    }
    console.log("Wrote to file.");
  });
};

const go = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.goto(castUrl);
  await page.waitForSelector(".large-9 .postbox");
  const numCastSections = (await page.$$(".large-9 .postbox")).length;

  for (let j = castSectionStart; j < numCastSections; ++j) {
    await page.goto(castUrl);
    for (let k = 0; k < 2; ++k) {
      await page.goto(castUrl);
      const linkAreaSelector = `.large-9 .postbox:nth-child(${j}) > .row > .small-12:nth-child(${k + 1}) > .cast > li`;
      await page.waitForSelector(linkAreaSelector);
      const numCastMembers = (await page.$$(linkAreaSelector)).length;
      for (let i = 0; i < numCastMembers; ++i) {
        await page.goto(castUrl);

        // Navigate to the page for the player (if actionable)
        await page.waitForSelector(linkAreaSelector);
        const linkSelector = `${linkAreaSelector}:nth-child(${i + 1}) > a`;
        try {
          await page.click(linkSelector);
        }
        catch (e) {
          continue;
        }

        // Handle 404 error
        const title = await page.title();
        if (title === "404 Not Found") {
          continue;
        }

        // Title is formatted with: "Survivor ... contestant <name>" 
        const name = title.match(/contestant .*$/)[0].substring(11);
        const genderData = gender.guess(name);

        // Get the image of the player
        await page.waitForSelector("img");
        const imageElement = (await page.$$("img"))[0];
        const banner = await page.evaluate(el => el.src, imageElement);

        // Get the bio of the player
        let bio;
        let season;
        for (let s = 1; s <= totalSeasons; ++s) {
          let bioElement = (await page.$$(`#s${s}bio > .posttext`))[0];
          if (!bioElement) {
            bioElement = (await page.$$(`#snz${s}bio > .posttext`))[0];
          }
          if (!bioElement) {
            bioElement = (await page.$$(`#sau${s}bio > .posttext`))[0];
          }

          if (!!bioElement) {
            const unformattedBio = await page.evaluate(el => el.innerHTML, bioElement);
            bio = unformattedBio
              .replace(/(\r\n\t|\n|\r\t)/gm, "")
              .replace(/ +/g, " ")
              .trim();
            season = s;
            break;
          }
        }

        // Save the data
        playersData.push({ name, banner, bio, season, genderData });
        console.log(`Saved data for ${name}, from season ${season}; ${genderData.gender}, ${genderData.confidence}`);
      }
    }
  }

  await browser.close();

  // Add more images for each player
  for (let d of playersData) {
    const profile = `${d.banner.substring(0, d.banner.indexOf("-bd3"))}.jpg`;
    d = { ...d, profile };
  }

  await writeObjectToFile(playersData);
};

go();