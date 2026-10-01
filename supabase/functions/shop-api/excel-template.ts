import ExcelJS from "npm:exceljs@4.4.0";

const TEMPLATE_ID = "USTORE_EXCEL_IMPORT_V4_TWO_SHEETS";
const SIMPLE_DATA_START_ROW = 6;
const VARIANT_DATA_START_ROW = 10;
const DATA_ROW_COUNT = 500;

function categoryPaths(categoryRows: any[]): any[][] {
  const byId = new Map((categoryRows || []).map((row: any) => [String(row.id), row]));
  const paths: any[][] = [];
  for (const category of categoryRows || []) {
    const path: any[] = [];
    const seen = new Set<string>();
    let current: any = category;
    while (current && !seen.has(String(current.id))) {
      seen.add(String(current.id));
      path.unshift(current);
      current = current.parent_id === null || current.parent_id === undefined
        ? null
        : byId.get(String(current.parent_id));
    }
    if (path.length) paths.push(path);
  }
  return paths.sort((a, b) => a.map((x) => x.name).join(" / ").localeCompare(b.map((x) => x.name).join(" / "), "uz"));
}

function styleHeader(sheet: any, widths: number[]) {
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function styleExampleRow(row: any, emphasizeCols: number[] = []) {
  row.height = 30;
  row.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
    cell.font = { color: { argb: "FF854D0E" }, bold: emphasizeCols.includes(cell.col) };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFFDE68A" } } };
  });
}

function addWarningRow(sheet: any, range: string, rowNumber: number, text: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: "FFB91C1C" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFFCA5A5" } },
    bottom: { style: "thin", color: { argb: "FFFCA5A5" } },
  };
  sheet.getRow(rowNumber).height = 56;
}

export async function buildExcelImportTemplate(categoryRows: any[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UStorE";
  workbook.created = new Date();

  const paths = categoryPaths(categoryRows);
  const fullPaths = paths
    .map((path) => path.map((item) => String(item.name || "").trim()).filter(Boolean).join(" / "))
    .filter(Boolean);
  const rankedRealPaths = [...fullPaths].sort((a, b) => {
    const depthDiff = b.split("/").length - a.split("/").length;
    return depthDiff || a.localeCompare(b, "uz");
  });
  const neutralPaths = [
    "Sport kiyimlari / Erkaklar / Futbolkalar",
    "Sport ozuqalari / Protein",
    "Sport buyumlari / Fitness anjomlari",
  ];
  const examplePaths = rankedRealPaths.length
    ? Array.from({ length: 3 }, (_, index) => rankedRealPaths[index % rankedRealPaths.length])
    : neutralPaths;

  // 1-list: FAQAT oddiy tovarlar.
  const simpleSheet = workbook.addWorksheet("Oddiy tovarlar", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  simpleSheet.addRow(["Katalog yo'li", "Tovar nomi", "Izohi", "Yangi narx", "Eski narx", "Soni"]);
  styleHeader(simpleSheet, [50, 34, 42, 16, 16, 12]);

  const simpleExamples = [
    [examplePaths[0], "Whey Protein 900 g", "Vanil ta'mli sport ozuqasi", 250000, 320000, 15],
    [examplePaths[1], "700 ml shaker", "Sport va kundalik foydalanish uchun", 85000, null, 12],
    [examplePaths[2], "Yoga gilamchasi", "Mashg'ulot uchun sirpanmaydigan gilamcha", 150000, 180000, 8],
  ];
  simpleExamples.forEach((values, index) => {
    const row = simpleSheet.getRow(index + 2);
    values.forEach((value, column) => { row.getCell(column + 1).value = value; });
    styleExampleRow(row, [1, 2]);
  });
  addWarningRow(simpleSheet, "A5:F5", 5, "⚠️ YUQORIDAGI 3 QATOR NAMUNA. O‘Z ODDIY TOVARLARINGIZNI 6-QATORDAN BOSHLAB KIRITING.");

  // 2-list: variativ tovarlar. Bo'sh kataklar oldingi tovar/rangni davom ettiradi.
  const variantSheet = workbook.addWorksheet("Variativ tovarlar", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  variantSheet.addRow(["Katalog yo'li", "Tovar nomi", "Izohi", "Rangi", "O'lchami", "Yangi narx", "Eski narx", "Soni"]);
  styleHeader(variantSheet, [50, 34, 42, 18, 16, 16, 16, 12]);

  const variantExamples = [
    [examplePaths[0], "Sport futbolkasi", "Nafas oluvchi yengil mato", "Yashil", "S", 180000, 220000, 3],
    [null, null, null, null, "M", 185000, 220000, 4],
    [null, null, null, "Oq", "S", 175000, null, 2],
    [null, null, null, null, "M", 180000, null, 3],
    [examplePaths[0], "Sport shim", "Elastik sport shim", "Qora", "M", 210000, 260000, 5],
    [null, null, null, null, "L", 215000, 260000, 4],
  ];
  variantExamples.forEach((values, index) => {
    const row = variantSheet.getRow(index + 2);
    values.forEach((value, column) => { row.getCell(column + 1).value = value; });
    styleExampleRow(row, [1, 2, 4]);
  });
  addWarningRow(variantSheet, "A8:H8", 8, "⚠️ TOVAR NOMI FAQAT BIRINCHI QATORDA. KEYINGI O‘LCHAMLARDA NOM/RANGNI BO‘SH QOLDIRING — USTIDAGI QIYMAT DAVOM ETADI. O‘Z TOVARLARINGIZNI 10-QATORDAN BOSHLANG.");
  variantSheet.getRow(9).height = 8;

  // Katalog yo'li dropdownlari.
  const catalogSheet = workbook.addWorksheet("Kataloglar", { views: [{ state: "frozen", ySplit: 1 }] });
  catalogSheet.addRow(["Katalog yo'li"]);
  catalogSheet.getRow(1).height = 28;
  catalogSheet.getRow(1).eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  fullPaths.forEach((path) => { catalogSheet.addRow([path]); });
  catalogSheet.getColumn(1).width = 72;

  const dictionarySheet = workbook.addWorksheet("Lugat");
  dictionarySheet.getCell(1, 1).value = "Katalog yo'li";
  fullPaths.forEach((path, index) => { dictionarySheet.getCell(index + 2, 1).value = path; });
  dictionarySheet.state = "veryHidden";

  const simpleLastRow = SIMPLE_DATA_START_ROW + DATA_ROW_COUNT - 1;
  const variantLastRow = VARIANT_DATA_START_ROW + DATA_ROW_COUNT - 1;
  if (fullPaths.length) {
    const formula = `Lugat!$A$2:$A$${fullPaths.length + 1}`;
    simpleSheet.dataValidations.add(`A${SIMPLE_DATA_START_ROW}:A${simpleLastRow}`, { type: "list", allowBlank: true, showErrorMessage: false, formulae: [formula] });
    variantSheet.dataValidations.add(`A${VARIANT_DATA_START_ROW}:A${variantLastRow}`, { type: "list", allowBlank: true, showErrorMessage: false, formulae: [formula] });
  }

  simpleSheet.dataValidations.add(`D${SIMPLE_DATA_START_ROW}:D${simpleLastRow}`, { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: false });
  simpleSheet.dataValidations.add(`E${SIMPLE_DATA_START_ROW}:E${simpleLastRow}`, { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true });
  simpleSheet.dataValidations.add(`F${SIMPLE_DATA_START_ROW}:F${simpleLastRow}`, { type: "whole", operator: "greaterThanOrEqual", formulae: [0], allowBlank: false });

  variantSheet.dataValidations.add(`F${VARIANT_DATA_START_ROW}:F${variantLastRow}`, { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: false });
  variantSheet.dataValidations.add(`G${VARIANT_DATA_START_ROW}:G${variantLastRow}`, { type: "decimal", operator: "greaterThanOrEqual", formulae: [0], allowBlank: true });
  variantSheet.dataValidations.add(`H${VARIANT_DATA_START_ROW}:H${variantLastRow}`, { type: "whole", operator: "greaterThanOrEqual", formulae: [0], allowBlank: false });

  const guideSheet = workbook.addWorksheet("Qo'llanma");
  guideSheet.columns = [{ width: 31 }, { width: 94 }];
  guideSheet.addRows([
    ["QOIDA", "TUSHUNTIRISH"],
    ["1-list — Oddiy tovarlar", "Rang/o'lcham varianti bo'lmagan mahsulotlar faqat shu listdan import qilinadi. Ustunlar: Katalog yo'li, Tovar nomi, Izohi, Yangi narx, Eski narx, Soni."],
    ["2-list — Variativ tovarlar", "Rang va/yoki o'lchami bo'lgan mahsulotlar faqat shu listdan import qilinadi. Har bir rang+o'lcham kombinatsiyasi alohida qator bo'ladi."],
    ["Variativ tovar nomi", "Tovar nomi va izohini faqat shu tovarning birinchi variant qatoriga yozing. Keyingi o'lcham/rang qatorlarida Tovar nomi va Izohi bo'sh qoladi — tizim ularni yuqoridagi tovarga biriktiradi."],
    ["Rangni davom ettirish", "Bir rangning keyingi o'lchamlarida Rangi katagini bo'sh qoldiring. Bo'sh rang yuqoridagi oxirgi rangni davom ettiradi. Yangi rang boshlansa, Rangi ustuniga yangi rang nomini yozing."],
    ["Misol", "Sport futbolkasi / Yashil / S / 180000 / 220000 / 3; keyingi qatorda nom va rang bo'sh, M / 185000 / 220000 / 4; keyin Rangi=Oq bilan yangi rang boshlanadi."],
    ["Narx", "Variativ listda har bir kombinatsiyaning Yangi narxi alohida yoziladi. Tovarning bazaviy narxi avtomatik ravishda birinchi variantning yangi narxidan olinadi; user/admin rang yoki o'lchamni almashtirganda shu variant narxi ko'rinadi."],
    ["Eski narx", "Ixtiyoriy. Chegirma ko'rsatish uchun Eski narx Yangi narxdan katta bo'lishi kerak."],
    ["Soni", "Oddiy listda tovarning umumiy qoldig'i. Variativ listda har bir rang+o'lcham kombinatsiyasining qoldig'i; umumiy qoldiq avtomatik yig'iladi."],
    ["Faqat rang / faqat o'lcham", "Faqat rangli mahsulotda O'lchami bo'sh qolishi mumkin. Faqat o'lchamli mahsulotda Rangi bo'sh qolishi mumkin. Ammo bitta variant qatorida rang ham, o'lcham ham bir vaqtda bo'sh bo'lmasin."],
    ["Katalog yo'li", "Barcha darajalarni bitta katakka / bilan yozing. Masalan: Sport kiyimlari / Erkaklar / Futbolkalar. Keyingi tovar shu katalogda bo'lsa yo'lni bo'sh qoldirish mumkin — yuqoridagi oxirgi yo'l davom etadi."],
    ["Kataklarni birlashtirmang", "Variativ listdagi daraxtsimon ko'rinish bo'sh kataklar orqali ishlaydi. Excel Merge Cells ishlatmang; aks holda import noto'g'ri o'qilishi mumkin."],
    ["Rasm", "Excel orqali rasm yuklanmaydi. Importdan keyin rangga tegishli rasm Admin → Tovar → Variantlar bo'limida yangi rang tizimi orqali qo'shiladi."],
  ]);
  guideSheet.getRow(1).eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  });
  guideSheet.eachRow((row: any) => { row.alignment = { vertical: "top", wrapText: true }; });

  const metadataSheet = workbook.addWorksheet("USTORE_META");
  metadataSheet.addRows([
    ["template_id", TEMPLATE_ID],
    ["simple_data_start_row", SIMPLE_DATA_START_ROW],
    ["variant_data_start_row", VARIANT_DATA_START_ROW],
    ["simple_sheet", "Oddiy tovarlar"],
    ["variant_sheet", "Variativ tovarlar"],
  ]);
  metadataSheet.state = "veryHidden";

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
