# LeetCode Copy Helper

[中文文档](./README.md)

LeetCode Copy Helper is a Tampermonkey userscript for copying LeetCode and LeetCode China problem statements as Markdown.

## Features

- Copies problem number, title, and URL.
- Copies difficulty and tags when available.
- Copies statement body, examples, and hints.
- Outputs Markdown.
- Injects a copy button into the problem page toolbar.

## Installation

- Install Tampermonkey.
- Install the script from Greasy Fork, or install it from the GitHub source.

## Supported Sites

- `https://leetcode.cn`
- `https://leetcode.com`

## Screenshot

![demo](./screenshots/demo.png)

## Known Limitations

- Button placement and statement extraction may need selector updates after LeetCode page-structure changes.

## License

Code and documentation in this repository are released under the [MIT License](./LICENSE).

The license only covers script code, documentation, and screenshot assets authored or organized in this repository. Problem statements, tags, examples, site structures, and other third-party content from LeetCode or LeetCode China are not relicensed by this repository.
