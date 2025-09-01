#!/bin/bash

# 检查是否提供了提交信息，如果没有则使用默认信息
if [ $# -eq 0 ]; then
    commit_message="Update files"
else
    commit_message="$*"
fi

echo "开始提交更改到Git仓库..."
echo "提交信息: $commit_message"

# 检查Git仓库状态
if ! git status > /dev/null 2>&1; then
    echo "错误: 当前目录不是Git仓库"
    exit 1
fi

# 添加所有更改的文件
echo "添加更改的文件..."
git add .

# 检查是否有需要提交的更改
if ! git diff --cached --quiet; then
    # 提交更改
    echo "提交更改..."
    git commit -m "$commit_message:$(date)"
    
    # 拉取远程最新更改（防止冲突）
    echo "拉取远程最新更改..."
    if ! git pull origin main --no-rebase; then
        echo "拉取过程中出现错误，请手动解决冲突后再试"
        exit 1
    fi
    
    # 推送到远程仓库
    echo "推送更改到远程仓库..."
    if git push origin main; then
        echo "成功推送更改到远程仓库！"
    else
        echo "推送失败，请检查网络或权限后再试"
        exit 1
    fi
else
    echo "没有需要提交的更改"
fi

exit 0
