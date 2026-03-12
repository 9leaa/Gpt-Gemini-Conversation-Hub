# AI Conversation Toolkit

适用于网页端 AI 对话工具的浏览器扩展，目前支持：

chatgpt
gemini

提供以下能力：

- **优化长会话卡顿**：一键隐藏旧消息，减少页面渲染压力。
- **定时自动优化**：通过独立滑动开关按周期自动执行长会话优化。
- **一键导出当前会话**：导出为 JSON 文件，包含当前识别到的全部消息内容。
- **Prompt 指令库**：支持 Prompt 的新增、删除、分类、排序、导入/导出 JSON、单击复制。


## 功能说明

1. **优化长会话卡顿**
   - 点击「优化长会话」按钮后，会隐藏较早的消息，仅保留最新 20 条。
   - 需要查看完整内容时，可点击「恢复隐藏消息」。

2. **定时自动优化**
   - 工具栏新增独立滑动开关；Gemini 平台默认关闭，其他平台默认开启。
   - ChatGPT 和 Gemini 会分别记忆各自的开关状态。
   - 开启后会每 10 秒自动执行一次「优化长会话」，不影响原有手动按钮。

3. **一键导出当前会话全部消息**
   - 点击「一键导出」按钮，会生成 JSON 文件并自动下载。
   - 导出的内容包括隐藏的旧消息（如果曾执行优化）。


4. **浮层收起与拖动**
   - 点击右上角「收起」按钮，浮层会变成圆形按钮。
   - 拖动圆形按钮可调整位置，点击即可重新展开。

5. **Prompt 指令库**
   - 点击「Prompt 指令」按钮打开弹窗。
   - 支持按关键词搜索、按分类筛选、按更新时间/标题/分类排序。
   - 支持新增 Prompt、删除 Prompt、导入 JSON、导出 JSON。
   - 单击列表项可直接复制 Prompt 内容，复制成功会有提示。

## 安装方式

### Firefox

1. 打开 `about:debugging` 或 `about:debugging#/runtime/this-firefox`
2. 点击「此 Firefox」→「临时载入附加组件」
3. 选择本项目根目录下的 `manifest.json`

### Microsoft Edge

1. 打开 `edge://extensions`
2. 开启右上角「开发人员模式」
3. 点击「加载已解压的扩展」并选择本项目根目录

### Google Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角「开发人员模式」
3. 点击「加载已解压的扩展」并选择本项目根目录

## 使用方法

1. 打开 ChatGPT 或 Gemini 的对话页面
2. 页面右下角会出现「AI 对话工具」浮层
3. 点击对应按钮执行优化、导出、Prompt 指令管理


## 可选配置

如需修改保留消息数量，可以在 `contentScript.js` 中调整 `keepLatest` 值。

```js
const state = {
  isCollapsed: false,
  keepLatest: 20,
  collapsedNodes: [],
  cachedNodes: [],
};
```

## 会话导出 JSON 格式

```json
{
  "exportedAt": "2026-03-11T08:30:00.000Z",
  "url": "https://gemini.google.com/app/xxxxxxxx",
  "messageCount": 2,
  "messages": [
    {
      "index": 1,
      "role": "user",
      "text": "你的消息"
    },
    {
      "index": 2,
      "role": "assistant",
      "text": "Gemini 的消息"
    }
  ]
}
```

字段说明：

- `exportedAt`：导出时间，ISO 8601（UTC）
- `url`：会话页面链接
- `messageCount`：导出的消息数量
- `messages`：消息数组
- `messages[].index`：消息序号（从 1 开始）
- `messages[].role`：消息角色（`user` / `assistant` / `unknown`）
- `messages[].text`：消息文本内容

## Prompt 指令库 JSON 格式

Prompt 指令库的导出文件为 JSON 对象，结构如下：

```json
{
  "version": 1,
  "updatedAt": "2026-03-10T08:30:00.000Z",
  "prompts": [
    {
      "id": "c94f7299-40f3-4f95-a9f7-0ff93029a3f8",
      "title": "日报总结",
      "category": "办公",
      "content": "请将今天工作整理为日报，按完成项、风险、计划输出。",
      "createdAt": 1741576200000,
      "updatedAt": 1741576200000
    }
  ]
}
```

导入时支持对象格式和数组格式，去重规则保持不变：按 `title + category + content` 去重（大小写不敏感）。

## 文件说明

- `manifest.json`：插件清单文件，定义脚本注入范围与权限
- `contentScript.js`：核心逻辑与平台适配层
- `styles.css`：工具浮层与 Prompt 弹窗样式
- `image`：README 说明图片

## 感谢支持

如果这个插件对你有用，顺手点个 star。

<img src="./image/收款码.jpg" width="250"/>
