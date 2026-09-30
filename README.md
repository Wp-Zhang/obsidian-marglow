# Marglow

Marglow 是一个正在设计中的 Obsidian 阅读标注插件，统一提供 Markdown 与 PDF 的高亮和评论体验。

名称来自 **margin**（页边批注）与 **glow**（高亮）。

## 当前状态

已完成 MVP 产品范围与设计确认，尚未实现可安装的插件。仓库目前作为后续开发的起点。

## MVP 目标

- 首批支持 **Mac + iOS**。
- 支持 Markdown **阅读视图**与可选文本的 PDF，包括跨页标注。
- 选择文本后就地高亮或评论，继续阅读，不要求切换到另一篇笔记。
- 源 Markdown 和 PDF 保持不变。
- 源文件旁的 **Markdown 阅读笔记**是标注唯一持久化数据源，可直接编辑、检索和引用。
- 支持部分重叠、评论双向编辑、完整条目删除和未定位标注重新关联。
- 文件同步与跨设备冲突处理交给用户已有的同步工具；插件负责安全局部写入、外部更新刷新和格式校验。

Windows、Markdown 编辑视图、专用 Copy link／Copy quote 操作和高级标注管理留在后续阶段。

## 设计文档

完整设计文档保存在本地 `dev/` 目录，不随 Git 仓库提交。仓库中的 [AGENTS.md](AGENTS.md) 记录核心设计原则、MVP 范围及开发约束。

开始实现前，优先验证 Mac／iOS 的 PDF 跨页选区、高亮生命周期、Markdown 阅读视图定位和旁置笔记的局部读写能力。

## 项目标识

| 项目 | 名称 |
| --- | --- |
| 产品名称 | Marglow |
| GitHub 仓库 | `Wp-Zhang/obsidian-marglow` |
| 计划插件 ID | `marglow` |

命名时已核对 [Obsidian 官方社区插件目录](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) 与 GitHub 仓库名检索，未发现同名插件。插件 ID 仍需在正式发布前再次核对。

## 本地开发

开发工具链尚未初始化，当前没有安装、构建或测试命令。后续建立项目骨架时补充实际可执行的开发说明。

使用独立测试 Vault 验证文件操作和标注行为；不要把个人 Vault、同步凭据或用户阅读材料提交到本仓库。
