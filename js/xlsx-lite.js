// (v9.489) كاتب xlsx صغير بلا مكتبات: ورقة واحدة، نصوص وأرقام، اتجاه يمين لشمال، تنسيق عنوان/رأس/مجموع.
// الملف = zip بدون ضغط (STORE) + CRC32. بيتفتح في Excel وGoogle Sheets وLibreOffice. نقي (بدون DOM).
const enc=new TextEncoder();
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
export function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const colName=(i)=>{ let s=''; for(i++;i>0;i=Math.floor((i-1)/26)) s=String.fromCharCode(65+(i-1)%26)+s; return s; };
// ZIP (STORE)
export function zip(files){   // files: [{name,data:Uint8Array}]
  const parts=[], cen=[]; let off=0;
  const u16=(v)=>[v&255,(v>>>8)&255], u32=(v)=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
  for(const f of files){
    const nm=enc.encode(f.name), crc=crc32(f.data), sz=f.data.length;
    const lh=new Uint8Array([0x50,0x4B,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(sz),...u32(sz),...u16(nm.length),...u16(0)]);   // 0x0800 = UTF-8 names, تاريخ ثابت 1980-01-01
    parts.push(lh,nm,f.data);
    cen.push(new Uint8Array([0x50,0x4B,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(sz),...u32(sz),...u16(nm.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nm);
    off+=lh.length+nm.length+sz;
  }
  const cs=cen.reduce((s,a)=>s+a.length,0);
  const end=new Uint8Array([0x50,0x4B,5,6,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cs),...u32(off),...u16(0)]);
  const all=[...parts,...cen,end], out=new Uint8Array(all.reduce((s,a)=>s+a.length,0)); let p=0; for(const a of all){ out.set(a,p); p+=a.length; } return out;
}
// rows: مصفوفة صفوف (نص/رقم)، styles: {title:[صفوف],head:[صفوف],total:[صفوف]} (فهارس صفر)، widths: عرض الأعمدة
export function buildXlsx({rows,styles={},widths=[18,26,34],sheetName='التقرير'}){
  const st=(r)=>(styles.title||[]).includes(r)?3:(styles.head||[]).includes(r)?1:(styles.total||[]).includes(r)?2:0;
  const sd=rows.map((row,r)=>{
    const cells=row.map((v,c)=>{ if(v===''||v==null) return st(r)?`<c r="${colName(c)}${r+1}" s="${st(r)}"/>`:''; const ref=`${colName(c)}${r+1}`, s=st(r)?` s="${st(r)}"`:'';
      return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}"${s}><v>${v}</v></c>`:`<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`; }).join('');
    return `<row r="${r+1}">${cells}</row>`; }).join('');
  const X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const files={
    '[Content_Types].xml':X+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':X+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0,31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':X+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE9A8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml':X+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sd}</sheetData></worksheet>`
  };
  return zip(Object.entries(files).map(([name,s])=>({name,data:enc.encode(s)})));
}
