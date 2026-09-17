# CSV Doctor ✳

**用 MoonBit 精确定位 CSV 问题，让每次修复可预览、可撤销。** 离线检查缺失、重复、类型、范围和枚举问题，定位原始字段，按用户确认替换并导出修改记录。

面向 MoonBit 九月黑客松的单人开源项目。核心 CSV 状态机、规则配置校验、数据规则执行、行号追踪、统计及诊断均由 MoonBit 实现；浏览器和 Node.js 共用同一份编译产物。界面为中文，所有文件在本机处理，无数据上传接口。

## 快速体验

需要 **Node.js 22+**。仓库已包含 MoonBit 编译后的 `web/core.js`，首次体验无需安装其他依赖。

```sh
npm start
```

打开 http://127.0.0.1:4173 ，点击 **载入问题示例**：6 行订单中将检出 3 行异常、6 条问题。支持粘贴 CSV、文件选择、拖放、规则编辑、问题筛选和完整报告下载。页面仅显示前 200 条问题，导出包含全部结果。

## 精确定位与可撤销修复

1. 载入示例，点击负金额旁的 **定位 / 修复**，查看高亮的原始字段。
2. 输入 `20`，点击 **预览替换**：显示原文、新文本和重新校验结果，此时数据尚未修改。
3. 点击 **确认应用并重新体检**：问题从 6 条变为 5 条。新值由使用者指定，程序不会推测正确金额。
4. 点击 **撤销上次修复**：恢复原始字段，问题回到 6 条。支持依次撤销多次修复。
5. 下载当前 CSV、会话原始 CSV 或 JSON 修复记录。记录包含逐步补丁、原值/新值及原始文件、结果文件、导出时规则的 SHA-256。

替换只修改指定字段，不重新序列化整个表格；未修改部分的 BOM、CRLF/LF/CR、引号和空格保持原样。替换字段统一使用双引号编码，并转义内部引号。规则检查仍由 MoonBit 核心执行；源文本替换、撤销和下载由浏览器适配层实现。

修复适用于已成功解析且实际存在的字段；缺列、整行结构和非法 CSV 需手动处理。允许确认后仍有规则问题的修复，界面会显示预期结果。修复会话只保存在内存，刷新、手动编辑 CSV 或加载新数据会重置历史；导出记录含原值，不做脱敏。达到 100 条操作记录后需导出并开始新会话（仍可撤销）。当前无补丁导入或 CLI 自动修复。

### 诊断位置协议

`issues[].span` 为可选字段。范围包括原始字段的外层引号，不包括分隔符和行尾。不存在的字段与整行问题不输出 span。

- `startUtf16` / `endUtf16`：从 0 开始的 UTF-16 代码单元半开区间，供 JavaScript 切片使用。
- `startByte` / `endByte`：从 0 开始的 UTF-8 字节半开区间，包含文件头 BOM 的字节占位。
- `startLine` / `startColumn`、`endLine` / `endColumn`：从 1 开始的原始文本位置。列按 Unicode 标量计数，tab 算一列；BOM 不算可见列；CRLF 算一次换行。
- 既有 `line` 仍表示记录起始行。浏览器和 HTML 报告显示字段起始行:列，缺少 span 时显示记录起始行。

文件载入后保存原始字符串；textarea 仅用于显示和手动编辑。手动编辑会采用浏览器规范化后的换行，因此字节保持承诺仅适用于通过修复面板修改的文件会话。

## 相关项目与独立贡献

MoonBit 已有 [NyaCSV](https://github.com/moonbit-community/NyaCSV)、[moonbit-csv](https://github.com/sikadi123/MoonBit) 等 CSV 库，以及提供校验、合同、报告、CLI 和中文网页的 [moon-csv-lite](https://github.com/clhhhhhh/moon-csv-lite)。本项目的基础校验与报告功能与它们存在重合，不将 CSV 解析或中文网页作为独有能力。

当前改进重点是：MoonBit 解析时保留每个字段的原始字节范围与行列位置，并将这些范围用于原文高亮、用户确认的局部替换、撤销和修复记录导出。针对 BOM、多行字段、CRLF、中文、非 BMP 字符及安全整数提供回归测试。这是可核对的实现重点，不是生态唯一性或参赛通过承诺。对照源码仅用于选题研究，本次未引入候选项目代码。

## 命令行

```sh
node cli.mjs examples/clean.csv --rules examples/rules.json
node cli.mjs examples/orders.csv --rules examples/rules.json --json reports/orders.json --html reports/orders.html
node cli.mjs --help
```

退出码：`0` 通过；`1` 检出数据问题；`2` 输入、配置或 IO 错误。JSON 输出到 stdout，简要状态输出到 stderr。问题示例返回 1 是预期行为。未提供规则时仅检查 CSV 结构；“通过”不代表所有业务数据都正确。

## 规则

浏览器可展开“用表单添加列规则”，填写列名、类型、必填、唯一性、范围和枚举后添加到 JSON。已有列规则不会被覆盖；修改后需重新体检。

```json
{
  "delimiter": ",",
  "columns": [
    {"column":"id", "required":true, "unique":true},
    {"column":"amount", "type":"number", "min":0, "max":100000},
    {"column":"status", "enum":["paid","pending"]},
    {"column":"active", "type":"boolean"}
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| column | 精确匹配标题，不自动去掉空格 |
| type | string（默认）、number、integer、boolean |
| required | 空字符串或纯空白不得出现，默认 false |
| unique | 非空原始字符串必须唯一，大小写敏感，默认 false |
| min / max | 包含边界，只允许用于 number / integer |
| enum | 允许的原始字符串列表，大小写敏感 |
| delimiter | 顶层分隔符，默认逗号；支持分号、制表符等单字符 |

可选空值跳过类型、范围、枚举、唯一性检查。boolean 仅接受小写 `true`、`false`。number 按 JSON 数值语法解析为 IEEE-754 Double，不接受 NaN/Infinity；不适用于高精度财务计算。integer 仅接受十进制整数字面量（允许负号和外围空白，不接受小数或指数），限制绝对值不超过 9007199254740991，避免浮点舍入把小数误判成整数。唯一性比较原始字符串，因此 `1` 与 `1.0` 不视为重复。

配置未知字段、错误字段类型、重复列规则、缺少指定列及反向范围会报错，避免拼写错误被静默忽略。

## CSV 边界

- UTF-8，支持文件开头 BOM、CRLF/LF/CR、引号内换行及 `""` 转义。
- 标题必需，空标题和重复标题报错。标题行本身不计入数据行数。
- 引号严格：未加引号字段中的引号、引号未闭合、结束引号后的额外字符均报错。
- 列数不一致记录为 `column_count` 问题，缺失字段视为空值；内部空行保留，文件尾换行不额外创建一行。
- `row` 从 1 起表示数据记录序号，`line` 是记录在原文件中的起始物理行。多行字段不会导致后续行号偏移错误。
- 当前为内存处理：CLI/浏览器 CSV 限 10 MiB，浏览器规则限 1 MiB。无流式处理、Excel、GBK、正则、自定义日期或自动修复功能。

## 编译与测试

安装 [MoonBit 官方工具链](https://www.moonbitlang.com/download/) 并将 `moon` 加入 PATH。开发时验证的版本为 `moon 0.1.20260915`。

```sh
moon check --target js
moon test --target js
npm run build
npm test
```

`npm run build` 将 MoonBit JS release 产物复制到 `web/core.js`。请勿手动修改生成文件。CI 使用当时最新 MoonBit 稳定工具链，因此上游语法变更可能需要跟进维护。

测试包括解析边界、配置校验、五类规则、原始行号、CLI 退出码、报告 HTML 转义、生成 CSV 样本及 20,000 行重复值检查。

## 结构与贡献

```text
core.mbt                 MoonBit 解析、规则和报告核心
core_wbtest.mbt           MoonBit 单元测试
cli.mjs                  Node.js IO 与退出码适配
web/core.js              MoonBit 生成的 ES module
web/worker.js            在 Web Worker 中调用核心
web/app.js               界面交互
web/report.js            HTML 报告输出（转义用户内容）
web/repair.js            原文补丁、撤销与修复记录
web/repair-ui.js         字段高亮、修复预览与确认
examples/                可复现示例数据和规则
tests/                   CLI 与集成测试
docs/PROJECT.md          参赛项目说明与演示流程
```

欢迎提交可复现的 CSV 和规则样例；请使用虚构数据，避免提交真实敏感数据。贡献前运行上面的测试与构建命令。

开发使用 AI 辅助编写和检查代码。本仓库的创建不表示已报名或通过验收。

## License

MIT。MoonBit 标准库及生成代码涉及的第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。


