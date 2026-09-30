# Marglow

![Marglow — a glowing page and a spark of insight](../assets/marglow-banner.png)

[English](../README.md) · 简体中文

Marglow 为 Obsidian 中的 Markdown 与 PDF 提供就地高亮和评论。每份材料拥有一份可编辑的 Markdown 阅读笔记，集中放在该材料目录的 `_marglow/` 子目录中，源文件保持不变。

名称来自 **margin**（页边批注）与 **glow**（高亮）。

## 界面展示

**Markdown：高亮、下划线，并直接在侧栏编辑评论。** 当前标注在正文与对应卡片中都有轮廓提示。

![Markdown 高亮、下划线与侧栏内评论编辑](../assets/screenshots/markdown-comments.png)

**PDF：阅读真实论文，将评论保留在正文旁边。** 示例使用 Vaswani 等人的 [Attention Is All You Need](https://arxiv.org/abs/1706.03762v5)，评论为演示阅读笔记。

![Attention Is All You Need 论文中的高亮、下划线与对应侧栏评论](../assets/screenshots/pdf-comments.png)

## 当前状态

**0.2.2 是 public beta**，可从 [GitHub Releases](https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.2.2) 安装，尚未通过 Obsidian 社区目录审核。Mac 集成已在 Obsidian 1.8.10 的独立测试 Vault 中验证。代码采用 iOS 可用的运行时能力并提供触屏控件，但 **iOS 真机验收尚未完成**。PDF 集成使用 Obsidian 查看器内部接口，宿主更新后可能需要适配。

Markdown 工具栏固定在阅读区域顶部，不随正文留白下移。页面常驻工具栏提供颜色选择、荧光笔 Highlight／下划线 Underline／消息框 Comment 图标和 Reading notes。Reading notes 直接展开原生右侧栏，不再新开文档标签页。可先选颜色，再开启 Highlight 标注后续选区；也可先点 Comment，再选择文字输入评论。再次点击已开启的工具即可关闭模式，选区浮动工具栏仍然保留。 移动端 Reading notes 使用图标加标注数量，工具栏保持单行。

0.2.2 让手机 Markdown 工具栏贴着原生导航栏下边缘，并一起收起和恢复；不再留下固定空白或造成滚动跳动，同时包含 0.2.1 的 PDF 修复。对于同页唯一匹配的 PDF 引用，按当前文字计算显示位置，避免继续显示其他设备保存的错误宽度；原始阅读笔记不被改写。已检查 Obsidian Desktop 1.13.7 mobile emulation 和 WebKit 26.6；iOS 真机复测仍需完成。

## 已实现功能

- 选中的标注支持 `Delete`、`Backspace` 和 Mac `Cmd + Delete` 删除；输入框仍按正常文字编辑处理。评论卡片右下角在悬停或键盘聚焦时显示 Delete，触屏保持可见。删除会同时移除高亮和评论。
- 当前选中的标注显示实线轮廓，悬停用较轻的虚线轮廓区分。
- 每份文档提供 **Comments** 侧栏，显示引用和评论，支持正文与卡片双向悬停高亮、点击卡片跳转和编辑评论。Comments 作为 Obsidian 原生右侧栏标签页，与大纲、反向链接并列，并跟随当前 Markdown/PDF 文档。尺寸和手机侧栏由 Obsidian 管理。
- 背景高亮和下划线作为独立类别保存，均支持四种颜色；同一选区可同时拥有两者，互不覆盖。旧条目未指定类别时仍按背景高亮读取。
- 在选区旁提供四种高亮颜色和轻量评论输入框。
- 支持 Markdown **阅读视图**，选区可以跨越格式元素和段落。
- 支持带可选文本层的 PDF，包括一条标注跨多个页面，以及随页面滚动、缩放、旋转移动的高亮。
- 部分重叠标注独立保存；相同实际选区复用同类别的已有标注。
- 点击或轻触评论输入框外部自动保存，并提供保存、取消、`Cmd + Enter` 和 `Esc`。
- 使用 `_marglow/source.md.annotations.md` 或 `_marglow/source.pdf.annotations.md` 阅读笔记，保存可读引用、评论、稳定块 ID 和隐藏定位元数据。
- 直接编辑阅读笔记中的评论或删除完整条目，原文显示随之更新。
- 手动重新关联未定位标注，并允许将阅读笔记重新关联到替代来源文件。
- 局部写入与格式校验，保留用户手写笔记及其他条目。

Windows、Markdown 编辑视图标注、OCR、专用 Copy link／Copy quote、PDF 批注写回和高级标注管理不属于本轮范围。

## 安装 public beta

从 [0.2.2 发布页](https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.2.2) 下载 `marglow-0.2.2.zip`，解压后将 `marglow/` 中的三个文件放到 `<vault>/.obsidian/plugins/marglow/` 中，然后重载 Obsidian 并在第三方插件设置中启用 **Marglow**。也可以分别下载 `main.js`、`manifest.json` 和 `styles.css`。

使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 时，添加仓库 `Wp-Zhang/obsidian-marglow`，允许预发布版本，或明确选择版本 `0.2.2`。首次体验请使用测试 Vault。iOS 使用同样的文件和现有同步方式；真机验收尚未完成。

发现问题请在 [GitHub Issues](https://github.com/Wp-Zhang/obsidian-marglow/issues/new/choose) 提供版本、设备、复现步骤和去除隐私信息的示例。

## 安装开发版本

构建需要 Node.js 22 或以上，运行需要 Obsidian 1.8.10 或以上。Obsidian 插件本身及 iOS 端不需要 Node.js。

打包还使用系统 `zip` 命令，macOS 与 Ubuntu CI 环境自带该工具。

```sh
npm ci
npm run check
npm run package
```

将 `dist/marglow/` 中的**文件**复制到 `<测试Vault>/.obsidian/plugins/marglow/`。该目录应直接包含 `main.js`、`manifest.json` 和 `styles.css`。重载 Obsidian，在“设置 → 第三方插件”中启用 Marglow。

iOS 使用相同的三个文件，通过你已有的文件管理或同步方式放入目标 Vault 的插件目录，然后在设备上启用。隐藏配置目录是否被传输取决于该方式，Marglow 不配置同步。初次验证请使用独立测试 Vault。

## 使用方式

1. 在**阅读视图**打开 Markdown，或打开具有可选文本层的 PDF。
2. 选择文本，点击颜色或 **Comment**，无需先打开阅读笔记。
3. 输入评论，显式保存或点击／轻触外部自动保存。取消会放弃本次未保存修改；保存为空的已有评论会保留高亮。
4. 点击高亮文字，修改颜色、编辑／移除评论或删除整条标注；重叠区域会提供条目选择列表。
5. 点击 **Reading notes** 展开 **Comments** 侧栏浏览标注；悬停正文或卡片可突出对应内容，点击引用定位，直接点击评论文字在卡片内原位编辑。支持保存、取消、点击外部自动保存和 `Cmd + Enter`／`Esc`；保存失败或条目已被外部修改时保留草稿。卡片显示最近更新时间；悬停时间可查看创建及更新时间。未定位条目继续显示。
6. 需要直接编辑伴随 Markdown 文件时，使用 **Marglow: Open reading notes** 命令打开阅读笔记。在评论边界内编辑，在条目外添加自己的笔记，或删除完整条目。

跳转通过引用和上下文验证目标。点击侧栏引用，会先加载长 Markdown 的远处段落或 PDF 远页，再对齐标注；点击正文标注，会打开评论标签页并滚动到对应卡片。位置缺失或有歧义时保留未定位状态，不猜测目标。段落索引及 PDF 查看器内部接口隔离在各自适配器中，并进行兼容性检查。

新阅读笔记存放在源目录的普通 `_marglow/` 子目录中；Vault 根目录的源文件使用根目录下的 `_marglow/`。文件名保留源扩展名以区分同名 Markdown/PDF。已有旁置笔记仍可识别并在原位置编辑；可在 Obsidian 内将它移动到 `_marglow/`，源关联通过元数据保留。每份材料只保留一份正式阅读笔记。

首条标注成功保存后才创建阅读笔记。手动删除时，应删除从 `oa:annotation:start` 到对应 `oa:annotation:end` 的整个条目。仅编辑评论时保持元数据和 ID 不变。

保存的摘录可通过普通 Obsidian 块引用使用：

```markdown
[[folder/_marglow/source.md.annotations#^ann-<saved-id>]]
```

请使用阅读笔记中的实际块 ID 替换示例占位内容。删除标注也会删除该引用的目标；其他编辑及重新关联保留 ID。

### 命令

命令面板中的以下命令均带有 `Marglow:` 前缀，插件界面目前使用英文。

| 命令 | 用途 |
| --- | --- |
| Open comments sidebar | 打开原生 Marglow 评论标签页 |
| Open reading notes | 打开当前材料的阅读笔记 |
| Open source document | 打开当前阅读笔记关联的源文件 |
| Reassociate an annotation | 选择条目，在源文件中重新选择文字，再点击 Reassociate |
| Cancel reassociation | 取消待完成的重新关联 |
| Relink reading notes to a source document | 在阅读笔记中，主动选择同类型的替代源文件 |

## 数据与同步

Markdown 阅读笔记是**唯一持久化标注数据源**，没有独立 JSON 数据库。插件不会为标注或块 ID 改写源 Markdown／PDF。

文件同步和跨设备冲突交给用户选用的同步工具。Marglow 不实现合并、时间优先裁决、冲突副本选择或删除墓碑。它读取当前文件，在发现边界损坏、元数据异常、重复 ID 或冲突标记时停止不安全写入。同步工具可能恢复旧内容，或生成结构异常的合并结果，需要按你已有的流程修复该文件。

编辑评论时不要删除或改变生成的元数据。需要修复时，可以用 **Marglow: Open reading notes** 命令打开笔记，修复结构后再重试。默认伴随文件名被无关笔记占用时，插件不会覆盖它。

## 开发与验证

```sh
npm run dev          # 监听变化并重建 main.js
npm run typecheck    # TypeScript 检查
npm test             # 存储、定位、PDF 几何与界面测试
npm run check        # 类型检查与测试
npm run package      # 生成 dist/marglow/ 中的可安装文件
npm run smoke:mac    # 在独立本地 Vault 中运行实际 Obsidian 测试
```

Mac 测试脚本默认使用 `/Applications/Obsidian.app`，也可通过 `OBSIDIAN_BIN` 指定可执行文件。它在被忽略的 `dev/` 下创建独立应用配置和 Vault，操作前检查路径，结束后关闭自己的测试进程，不安装到或修改个人 Vault。

设备验收见 [测试清单](TESTING.md)，开发原则见 [AGENTS.md](../AGENTS.md)。完整设计文档仅存于本地被忽略的 `dev/`，不提交到 Git。

运行时除宿主提供的 Obsidian API 外，不捆绑第三方依赖。开发参考资料只用于接口研究，其代码不随插件发布。

## 许可证

[MIT](../LICENSE).
