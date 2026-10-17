# NEON ARCADE PRO

一个可运行的霓虹风格游戏网站全栈起步项目。包含响应式游戏大厅、账号注册/登录、密码哈希、SQLite 持久化、成绩保存、排行榜和管理员控制中心。

## 需要什么

- Node.js 20 或更新版本
- npm
- 首次安装依赖需要网络连接

## 本地运行

1. 解压 ZIP，进入 `neon_arcade_pro` 文件夹。
2. 安装依赖：

   ```bash
   npm install
   ```

3. 复制 `.env.example` 为 `.env`，并设置 `SESSION_SECRET` 和 `ADMIN_PASSWORD`。开发环境可先直接使用默认值，但建议更改管理员密码。
4. 启动：

   ```bash
   npm start
   ```

5. 浏览器打开 `http://localhost:3000`。

Windows PowerShell 也可以用 `Copy-Item .env.example .env` 复制环境文件。项目会自动读取 `.env` 文件；请把 `.env.example` 复制为 `.env`，然后修改其中的密钥和密码。

PowerShell 示例（当前终端会话有效）：

```powershell
$env:SESSION_SECRET="换成至少32位的随机字符串"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="换成至少14位的独立密码"
npm start
```

macOS/Linux 示例：

```bash
export SESSION_SECRET="换成至少32位的随机字符串"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="换成至少14位的独立密码"
npm start
```

首次启动时，如果管理员账号不存在，会根据环境变量创建管理员账号。之后修改环境变量里的密码不会自动覆盖数据库中已有的管理员密码。

## 已有功能

- 深色霓虹 UI，支持桌面与手机布局
- 游戏搜索与分类筛选
- 反应力测试、记忆矩阵、点击能量核心、2048
- 注册、登录、退出；bcrypt 密码哈希与会话 Cookie
- SQLite 保存玩家、成绩与游戏条目
- 成绩排行榜、玩家档案
- 管理员概览、添加游戏条目、隐藏/恢复游戏
- Helmet 安全响应头、登录接口速率限制、会话存储于 SQLite

## 重要说明

- 这是可运行的开发起步项目，不等于经过安全审计的生产系统。
- 管理员密码只在首次创建账号时用于初始化；请妥善保管数据库文件和环境变量。
- 正式部署前请配置 HTTPS、强随机 `SESSION_SECRET`、独立管理员密码、备份策略和日志监控；建议补上 CSRF 防护、邮箱验证、密码重置与账号锁定策略，并检查依赖更新。
- 分数在服务端验证格式和范围，但游戏规则本身在浏览器端运行；高对抗性排行榜还应加入服务端判分/防作弊策略。
- `npm install` 需要网络下载依赖；当前压缩包不包含 `node_modules`。
