import gender from "gender";

for (let i = 0; i < data.length; ++i) {
  data[i] = { ...data[i], "gender": gender.guess(data[i].name) };
}