export function reportRows(data,tab){
 if(tab==='customers')return {columns:['Mijoz','Buyurtmalar','Jami xarid',...(data.piiVisible?['Telefon']:[])],rows:(data.customers||[]).map(r=>[String(r.name||r.tgId||''),Number(r.totalOrders)||0,Number(r.totalSpent)||0,...(data.piiVisible?[String(r.phone||'')]:[])])};
 const rows=tab==='overview'?data.topProducts:tab==='sales'?data.byProduct:data.products;
 return {columns:['Mahsulot','Dona','Tushum',...(tab==='products'?['Qoldiq']:[])],rows:(rows||[]).map(r=>[String(r.name||r.productId||''),Number(r.unitsSold)||0,Number(r.revenue)||0,...(tab==='products'?[Number(r.currentStock)||0]:[])])};
}
export async function buildReportWorkbook(data,tab,ExcelJS){
 const book=new ExcelJS.Workbook();const summary=book.addWorksheet('Umumiy');
 summary.addRows([['UStorE',tab],['Boshlanish',String(data.dateFrom||'')],['Tugash',String(data.dateTo||'')],['Tushum',Number(data.totalSales)||0],['Natijalar',Number(data.totalCount??data.orderCount??data.totalOrders)||0]]);
 if(tab==='customers')for(const key of ['totalCustomers','newCustomers','repeatCustomers','avgCustomerSpend'])summary.addRow([key,Number(data.kpi?.[key])||0]);
 const detail=book.addWorksheet('Tafsilotlar');const table=reportRows(data,tab);detail.addRow(table.columns);detail.addRows(table.rows);
 for(const sheet of [summary,detail]){sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];sheet.columns.forEach((column,index)=>{column.width=index===0?38:24;});}
 detail.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,table.rows.length+1),column:table.columns.length}};
 return book.xlsx.writeBuffer();
}
export function downloadReport(bytes,fileName,documentRef=globalThis.document){
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=documentRef.createElement('a');a.href=url;a.download=fileName;documentRef.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
