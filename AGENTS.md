# AGENTS.md

本项目遵循 `yinhelaoxian/dev-infra` 仓库中的 [CONVENTIONS.md](https://github.com/yinhelaoxian/dev-infra/blob/main/CONVENTIONS.md)：

- 新建工作区（新任务、新工具接入本项目）请用
  `dev-infra/scripts/new-worktree.sh <this-repo-name> <task-name>`，
  不要直接 `git clone` 本仓库到新目录。
- JS/Node 依赖使用 `pnpm`，不使用 `npm`/`yarn`。
- Python 依赖使用 `uv`，不使用裸 `pip`。
- Java 依赖走默认 Maven（`~/.m2/repository`），无需额外配置。
- GitHub Actions：默认 `ubuntu-latest`（hosted runner），仅在确认超出免费分钟数时
  才使用 ora 上的 self-hosted runner。
- 删除/清理工作区前，务必先确认 `git status --porcelain` 为空、无 stash、
  无领先 upstream 的未推送 commit，再用 `git worktree remove`。

<!-- 项目特有的补充规则写在下面 -->
