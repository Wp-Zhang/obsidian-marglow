# Marglow

![Marglow — a glowing page and a spark of insight](../assets/marglow-banner.png)

[English](../README.md) · 简体中文

在 Obsidian 中为 Markdown 和 PDF 添加高亮、下划线与评论，保持阅读连贯。Marglow 将标注保存为可编辑的 Markdown 阅读笔记，源文件保持不变。

名称来自 **margin**（页边批注）与 **glow**（高亮）。

## 当前状态

**[0.3.0 公开 beta](https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.3.0)** 包含下述新版阅读笔记流程。新版通过隔离环境中的 Mac、移动模拟和 WebKit 检查，0.3.0 的 iOS 真机验收待完成。旧版 0.2.5 已获维护者真机测试通过反馈；Marglow 已通过社区插件审核。

## 产品方向

阅读时记录反应，日后回顾当时的思路，并在普通 Obsidian 笔记中连接不同材料的理解。正文保持可编辑，定位元数据集中在同一文件的文末。分类、总结、阅读状态和阅读入口均为可选。

## 功能

- 四种颜色的背景高亮和下划线，可附加评论。
- 支持 Markdown **阅读视图**，选区可跨越格式元素和段落。
- 支持具有可选文本层的 PDF，包括跨页选区。
- Obsidian 原生 **Reading notes** 侧栏，支持原位编辑、时间显示及正文与卡片双向跳转。
- 支持重叠标注，并区分选中与悬停状态。
- 浮动评论编辑窗可拖动；评论图标提示附带评论的片段，鼠标悬停即可预览。
- 在已有标注内重新选择文本时保持原生选区清晰，PDF 高亮高度贴合实际文本行框。
- 可直接编辑的 Markdown 阅读笔记正文，元数据集中在文末。
- 无需选区的整篇想法，每条新记录保留独立日期与 ID。
- Copy reference 一起复制来源、摘录与评论的原生嵌入，方便在其他笔记中复用。
- 支持无标注创建笔记、可选阅读状态，以及包含原生搜索或可选 Bases 表格的阅读入口。
- 旧笔记升级提供预览与原始备份，并保留摘录 ID。
- 原文移动或变化后，可手动重新关联标注。
- 本地存储，无网络服务，配合你已有的 Vault 同步方式使用。

## 界面展示

**阅读笔记：一起回顾带日期的整篇想法与片段批注。**

![原生阅读笔记侧栏中的整篇想法与片段评论](../assets/screenshots/reading-notes.png)

**跨材料整理：将引用粘贴到问题笔记，在摘录与评论之间写下自己的比较。**

![问题笔记中的来源链接、摘录嵌入和完整多段评论嵌入](../assets/screenshots/reading-synthesis.png)

**Markdown：高亮、下划线，并直接在侧栏编辑评论。**

![Markdown 高亮、下划线与侧栏内评论编辑](../assets/screenshots/markdown-comments.png)

**评论预览：悬停带评论的标注即可查看完整评论，无需打开编辑框。**

![高亮片段、评论图标与下方简洁的评论预览](../assets/screenshots/comment-preview.png)

**PDF：阅读论文，在侧栏查看对应标注。** 示例使用 Vaswani 等人的 [Attention Is All You Need](https://arxiv.org/abs/1706.03762v5)，评论为演示阅读笔记。

![Attention Is All You Need 论文中的高亮、下划线与对应侧栏评论](../assets/screenshots/pdf-comments.png)

## 安装

需要 **Obsidian 1.8.10 或以上**。目标平台为 Mac 和 iOS。新版 iOS 真机验收待完成；可选 Bases 表格需要 Obsidian 1.9+ 并启用其核心插件。

### 已发布 beta

1. 打开“设置 → 第三方插件 → 浏览”。
2. 搜索 **Marglow**，点击“安装”并启用。

Mac 和 iOS 使用相同的步骤，已有用户可在第三方插件中更新 Marglow。升级阅读笔记到格式 2 前，请先在所有阅读设备安装 Marglow 0.3.0 或以上。

### 手动安装或从源码构建

1. 从[发布页面](https://github.com/Wp-Zhang/obsidian-marglow/releases/tag/0.3.0) 下载并解压 `marglow-0.3.0.zip`。若从源码构建，在仓库运行 `npm ci` 和 `npm run package`，使用 `dist/marglow-0.3.0.zip` 或 `dist/marglow/` 的文件。
2. 将解压后的 `marglow/` 中的 `main.js`、`manifest.json` 和 `styles.css` 放入 `<test-vault>/.obsidian/plugins/marglow/`。
3. 重载 Obsidian，在“设置 → 第三方插件”中启用 **Marglow**。

iOS 使用相同的三个文件，通过文件管理或同步方式放入 Vault 的插件目录，再在设备上启用 Marglow。部分同步工具不会自动传输隐藏的 `.obsidian/` 配置目录。

### BRAT

使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 时，添加仓库 `Wp-Zhang/obsidian-marglow`，或明确选择 `0.3.0`。

首次体验请使用测试 Vault。发现问题请在 [GitHub Issues](https://github.com/Wp-Zhang/obsidian-marglow/issues/new/choose) 提供应用及插件版本、设备、复现步骤和去除隐私信息的示例。

## 使用方式

1. 在**阅读视图**打开 Markdown，或打开文字可选的 PDF。
2. 选择文本后点击颜色添加高亮，或使用下划线、评论工具。也可以先开启工具栏中的工具再选择文本；再次点击已开启的工具即可关闭。
3. 输入评论并保存，或点击／轻触外部自动保存。取消会放弃本次未保存修改。Mac 支持 `Cmd + Enter` 保存、`Esc` 取消。
4. 点击已有标注将其选中。侧栏隐藏时，通过浮动工具编辑；侧栏可见时，仅选中并滚动到对应卡片，不弹出浮窗。两种模式下均可用顶部工具栏修改选中标注的颜色、切换荧光笔／下划线，保留其 ID 和评论。重叠条目在侧栏中选择；侧栏隐藏时使用浮动选择列表。
5. 点击 **Reading notes**（移动端为图标加数量）开关原生 **Reading notes** 侧栏，点击标注不会自动展开侧栏。点击侧栏引用跳转到原文，直接点击评论文字在卡片内编辑。

选中的标注可用 `Delete`、`Backspace`、Mac `Cmd + Delete` 或垃圾桶图标删除。删除标注会同时移除标记和评论；仅清空评论会保留标记。输入框中的快捷键仍按正常文字编辑处理。保存失败时保留未保存的评论。

拖动浮动编辑窗的 **Comment** 标题即可移动窗口；标题获得焦点后也可用方向键调整。移动保留当前草稿，视口变化时窗口保持可达，侧栏内的编辑框仍固定在卡片中。附带评论的片段显示小评论图标，鼠标悬停即可查看简洁的只读预览，无需进入编辑。选择原文时临时隐藏标注绘制，使原生选区保持清晰。

在浮窗内更改颜色或样式后，外观立即保存，窗口保持在原位置。评论草稿保留到点击 Save 或点击外部自动保存；Cancel 只丢弃尚未保存的文字。连续修改保持同一条标注及其引用。

侧栏顶部保留材料标题、**Open complete note** 图标与轻量状态选择器。**Thoughts** 右侧的加号用于新增想法。记录底部统一放置时间、**Copy reference** 和删除图标；图标提供悬停提示和可访问的名称。空的 Thoughts 区不再显示解释性占位段落。

没有评论的卡片将 **Add comment** 图标放在右下角，与复制、删除并排，不再单独占用一行文字。标注卡片的操作图标在鼠标悬停或键盘聚焦时统一显示，触屏布局保留可见入口。同一选区已有目标样式的另一条标注时，切换样式会保留两条记录并提示选择已有条目。

通过侧栏 **Add thought** 或 **Marglow: Add whole-material thought** 无选区记录整篇想法。保存会追加带日期的记录，编辑旧想法则修改那条记录；保存、取消和外部点击规则与评论一致。只有主动选择时才改变阅读状态。

在已保存卡片上使用 **Copy reference**，或通过编辑器记录菜单复制引用，粘贴到普通问题笔记中。摘录与多段评论保留对阅读笔记的引用，后续编辑会更新嵌入；暂不提供纯文本快照或批量复制。

无法定位的标注仍会显示在侧栏。使用 **Reassociate an annotation** 将其关联到替代文本；位置有歧义时不会自动猜测。

## 阅读笔记与同步

首次保存标注或想法、主动创建笔记、或设置阅读状态时按需创建阅读笔记。打开原文或侧栏不创建或改写笔记。新笔记存放在源目录的普通 `_marglow/` 子目录中：

```text
article.md
paper.pdf
_marglow/
  article.md.annotations.md
  paper.pdf.annotations.md
```

每份材料只保留一份阅读笔记，已有位置仍受支持。原文保持不变；原文消失后，笔记仍可保留和使用。

格式 2 可通过 **Open complete note** 在原生编辑器中编辑摘录、评论 callout、想法与自由笔记。正文只有普通 Markdown 块和稳定 ID，系统数据位于文末。请保留块 ID 与系统数据。清空评论保留空 callout、ID、高亮和已有引用；通过删除控件可一次移除完整记录。

如果只删除正文块而留下元数据，该记录是不完整的。Marglow 暂停不安全写入；通过 **Review missing reading records** 确认删除残留记录，或打开笔记修复。定位数据无法恢复丢失的评论。冲突标记、重复 ID、未知版本或损坏数据也会暂停写入，原文件保持不变。

旧格式 1 继续按原规则读写。使用 **Upgrade reading note format** 预览转换并保存经过核对的 `<笔记>.v1.bak` 原始备份，保留文档与标注 ID、摘录块 ID、评论和手写内容。打开旧笔记不自动升级。使用格式 2 前，请先更新所有阅读设备上的 Marglow；旧版本不能可靠写入新格式，尤其是在笔记已移动的情况下。备份仅包含升级前内容，不含后续修改；恢复前先保留当前笔记。

**Copy reference** 使用实际保存的 ID。旧摘录链接仍指向摘录，新增评论 ID 指向整个评论 callout。后来添加评论不会自动给已粘贴的纯摘录引用增加第二个嵌入。普通块链接定位到阅读笔记，精确回到原文选区由 Marglow 导航完成。

可选地在笔记属性中设置 `marglow_title` 作为显示标题。**Create reading home** 在你选择的位置创建普通 Markdown 入口，不覆盖已有文件；可选 Bases 表格提供 All、Reading、Read 视图，没有 Bases 时可使用原生搜索。修改时间表示文件编辑时间，不能当作阅读日期。

阅读笔记是唯一持久化标注数据源。已有同步工具负责文件传输与跨设备冲突；Marglow 不提供同步或版本选择子系统。

### 命令

命令面板中的以下命令均带有 `Marglow:` 前缀，插件界面目前使用英文。

| 命令 | 用途 |
| --- | --- |
| Open comments sidebar | 打开原生阅读笔记侧栏 |
| Create reading note | 主动创建或复用伴随笔记 |
| Add whole-material thought | 无选区追加整篇想法 |
| Upgrade reading note format | 预览升级并保留已核对的原始备份 |
| Review missing reading records | 检查并确认删除不完整记录 |
| Create reading home | 创建 Markdown 入口及可选 Bases 视图 |
| Open reading notes | 打开当前材料的伴随 Markdown 阅读笔记 |
| Open source document | 打开当前阅读笔记关联的源文件 |
| Reassociate an annotation | 选择条目，重新选择替代文本，再点击 Reassociate |
| Cancel reassociation | 取消待完成的重新关联 |
| Relink reading notes to a source document | 从阅读笔记中选择同类型的替代源文件 |

## 限制

- 原文高亮支持 Markdown 阅读视图；原文编辑视图与无文本层扫描 PDF 在范围之外。伴随阅读笔记的编辑受到支持。
- 本 beta 尚未验证 Windows。
- 标注保存在阅读笔记中，不嵌入 PDF 或源 Markdown。
- PDF 集成依赖 Obsidian 查看器内部接口，宿主更新后可能需要适配。
- 已支持引用复制；纯文本摘录快照与自定义复制模板仍为后续工作。
- 新版移动输入、剪贴板和升级交互仍需 iOS 真机验收。

## 开发

构建需要 Node.js 22 或以上和系统 `zip` 命令，运行插件不需要 Node.js。

```sh
npm ci
npm run check        # 类型检查、lint 与测试
npm run package      # 生成 dist/marglow/ 中的可安装文件
```

按照上述手动安装步骤，将 `dist/marglow/` 中的文件安装到独立测试 Vault。开发时可用 `npm run dev` 监听变化并重建。

推送数字版本标签后，GitHub Actions 会构建、生成来源证明并发布文件。ZIP 用于手动安装，Obsidian 只下载三个插件文件。

宿主集成检查使用 `npm run smoke:mac`、`npm run smoke:mobile` 和 `npm run smoke:webkit`。环境配置、验证记录及设备清单见 [测试说明](TESTING.md)，开发原则见 [AGENTS.md](../AGENTS.md)。

## 许可证

[MIT](../LICENSE)。
