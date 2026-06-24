// scripts/migrate-archetypes.ts — 類型の統合移行（ADR-0010）。 pnpm run migrate:archetypes
// 全ページの 類型 で 旧5種→専門集積型 に置換（重複除去）。冪等。
import { Client } from "@notionhq/client";
const DATABASE_ID = process.env.NOTION_DB_ID ?? ""; // .env から。リポジトリに識別子を載せない
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const COLLAPSE = new Set(["サブカル集積型","古書店街型","専門卸街型","町工場集積型","大工場・産業発祥型"]);
const title = (p:any)=> p?.type==="title" ? p.title.map((t:any)=>t.plain_text).join("") : "";

async function main(){
  if(!process.env.NOTION_TOKEN){console.error("NOTION_TOKEN未設定");process.exit(1);}
  const rows:any[]=[]; let c:string|undefined;
  do{const r:any=await notion.databases.query({database_id:DATABASE_ID,start_cursor:c,page_size:100});
     rows.push(...r.results); c=r.has_more?r.next_cursor:undefined;}while(c);
  let n=0;
  for(const p of rows){
    const cur:string[]=p.properties["類型"]?.multi_select?.map((o:any)=>o.name)??[];
    if(!cur.some(x=>COLLAPSE.has(x))) continue;
    const next:string[]=[];
    for(const x of cur){const v=COLLAPSE.has(x)?"専門集積型":x; if(!next.includes(v)) next.push(v);}
    await notion.pages.update({page_id:p.id, properties:{ "類型": { multi_select: next.map(name=>({name})) } } as any});
    console.log(`✓ ${title(p.properties["駅名"])}: ${cur.join("/")} → ${next.join("/")}`);
    n++;
  }
  console.log(`\n=== 移行完了: ${n}ページ更新 ===`);
}
main().catch(e=>{console.error(e);process.exit(1);});
