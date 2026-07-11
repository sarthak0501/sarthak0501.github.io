import yaml from "js-yaml";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));

  eleventyConfig.addPassthroughCopy({
    "src/css": "css",
    "src/js": "js",
    "src/fonts": "fonts",
    "src/static": "/",
    "resumes": "resumes",
    "assets": "assets",
    "og": "og",
  });

  eleventyConfig.addFilter("isoDate", (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().slice(0, 10);
  });
  eleventyConfig.addFilter("humanDate", (d) => {
    const date = d instanceof Date ? d : new Date(`${d}T12:00:00Z`);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
