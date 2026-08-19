// 从 data/characters.json 生成内嵌数据副本，写入 index.html 的 /*__CHARACTERS_EMBED__*/ 占位符。
// 用途：页面在 file:// 协议下 fetch 会被 CORS 拦截，内嵌副本作为兜底数据，保证本地双击也能打开。
// 修改 characters.json 后运行：node tools/embed-characters.js
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'characters.json');
const htmlPath = path.join(__dirname, '..', 'index.html');
const placeholder = '/*__CHARACTERS_EMBED__*/';

const json = fs.readFileSync(dataPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes(placeholder)) {
    console.error('错误：index.html 中未找到占位符 ' + placeholder);
    process.exit(1);
}

// 校验 JSON 合法性并统计
const list = JSON.parse(json);
if (!Array.isArray(list)) {
    console.error('错误：characters.json 顶层必须是数组');
    process.exit(1);
}

const embedded = 'var CHARACTER_DATA = ' + json.trim() + ';';
const out = html.replace(placeholder, embedded);
fs.writeFileSync(htmlPath, out);

console.log('已更新 index.html 内嵌角色数据副本：' + list.length + ' 条角色');
