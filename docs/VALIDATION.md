# 验证记录

验证环境：Windows、Node.js、MoonBit `moon 0.1.20260915`，JS backend。

- `moon check --target js`：通过，无警告。
- `moon test --target js`：10 组通过。
- `node --test tests/integration.test.mjs`：9 组通过。
- 集成测试涵盖 50 个生成 CSV 样本、20,000 行数据的重复检查、退出码与 HTML 转义。
- 浏览器实际验证：加载问题示例后显示 6 行、3 行通过、3 行异常、6 条问题；重复值筛选显示一条正确诊断。

没有将单次耗时作为性能承诺。GitHub Actions 的结果需以实际远程运行状态为准。
