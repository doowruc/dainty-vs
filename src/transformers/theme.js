const path = require("path");
const util = require("util");
const convert = require("xml-js");
const fs = require("fs");
const uuidv1 = require("uuid/v1");
const {
  cloneDeep,
  applyReplacements,
  logTransform
} = require("dainty-shared/src/utils");
const {
  getColorFunction,
  getPropertyFunction,
  getTypeShadeFunction
} = require("dainty-shared/src/colors");
const { toVsColorHex } = require("../conversions");
const {
  getSearchReplaceCustomizations,
  getCategoriesCustomizations
} = require("../customizations/theme");

const readFile = util.promisify(fs.readFile);

async function transformTheme(configuration) {
  const source = path.join(__dirname, "../sources/dark.vstheme");

  logTransform(source);

  const content = await readFile(source, "utf8");

  let replacedContent = applyReplacements(
    content,
    getSearchReplaceCustomizations(
      configuration,
      getColorFunction(configuration),
      getPropertyFunction(configuration, getColorFunction(configuration)),
      getTypeShadeFunction(configuration)
    ),
    toVsColorHex,
    toVsColorHex
  );

  replacedContent = applyReplacements(replacedContent, [
    ["ThemeName", configuration.name],
    ["ThemeGUID", uuidv1()]
  ]);

  try {
    replacedContent = applyCategoriesCustomizations(
      replacedContent,
      getCategoriesCustomizations(
        configuration,
        getColorFunction(configuration),
        getPropertyFunction(configuration, getColorFunction(configuration)),
        getTypeShadeFunction(configuration)
      )
    );
  } catch (error) {
    return [error, null];
  }

  return [null, replacedContent];
}

function applyCategoriesCustomizations(xmlContent, categegoriesCustomizations) {
  let jsContent = convert.xml2js(xmlContent);
  let customizations = cloneDeep(categegoriesCustomizations);

  const categories = jsContent.elements[0].elements[0].elements;

  for (let category of categories) {
    const categoryName = category.attributes.Name;

    if (customizations[categoryName] === undefined) {
      continue;
    }

    for (let colorsGroup of category.elements) {
      const colorsGroupName = colorsGroup.attributes.Name;
      const colorsGroupCustomizations =
        customizations[categoryName][colorsGroupName];

      if (colorsGroupCustomizations === undefined) {
        continue;
      }

      if (
        !Array.isArray(colorsGroupCustomizations) ||
        colorsGroupCustomizations.length !== 2
      ) {
        throw new Error(
          `Colors group for \`${categoryName}.${colorsGroupName}\` must be an array consisting of two elements; one with background color, and one with foreground color.`
        );
      }

      let backgroundElement = colorsGroup.elements.find(
        e => e.name === "Background"
      );

      if (
        backgroundElement === undefined &&
        colorsGroupCustomizations[0] !== null
      ) {
        throw new Error(
          `Replacement background set for colors group \`${categoryName}.${colorsGroupName}\`, but no such background is defined`
        );
      } else if (
        backgroundElement !== undefined &&
        colorsGroupCustomizations[0] !== null
      ) {
        backgroundElement.attributes.Source = toVsColorHex(
          colorsGroupCustomizations[0]
        );
      }

      let foregroundElement = colorsGroup.elements.find(
        e => e.name === "Foreground"
      );

      if (
        foregroundElement === undefined &&
        colorsGroupCustomizations[1] !== null
      ) {
        throw new Error(
          `Replacement foreground set for colors group \`${categoryName}.${colorsGroupName}\`, but foreground not defined in .vstheme.`
        );
      } else if (
        foregroundElement !== undefined &&
        colorsGroupCustomizations[1] !== null
      ) {
        foregroundElement.attributes.Source = toVsColorHex(
          colorsGroupCustomizations[1]
        );
      }

      delete customizations[categoryName][colorsGroupName];
    }

    if (Object.keys(customizations[categoryName]).length !== 0) {
      throw new Error(
        `Replacements set for category \`${categoryName}\` but color groups not defined in .vstheme: ${Object.keys(
          customizations[categoryName]
        ).join(", ")}`
      );
    }
    delete customizations[categoryName];
  }

  if (Object.keys(customizations).length !== 0) {
    throw new Error(
      `Replacements set for categories not defined in .vstheme: ${Object.keys(
        customizations
      ).join(", ")}`
    );
  }

  return convert.js2xml(jsContent, { spaces: 2 });
}

module.exports = {
  transformTheme
};
