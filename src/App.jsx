import React, { useState, useEffect, useMemo } from 'react';

export default function App() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorLog, setErrorLog] = useState(null);

  // الفلاتر ومربع البحث
  const [selectedSite, setSelectedSite] = useState('الكل'); 
  const [selectedStatus, setSelectedStatus] = useState('الكل'); 
  const [connFilter, setConnFilter] = useState('الكل'); 
  const [searchQuery, setSearchQuery] = useState('');
  const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqxYIY4s86E03NW7cnRPZn_pPmYuSKsWVHwwwK66wz4Bfh1FnpxKCcRMmhl8iBIzFYhL07SLWyJO72/pub?gid=421995879&single=true&output=csv";

  // دالة جلب وتفسير البيانات برمجياً عبر الـ HTTP Request وتخطي الـ CORS
  const fetchSheetData = async () => {
    try {
      if (!GOOGLE_SHEET_CSV_URL || GOOGLE_SHEET_CSV_URL.includes("https://docs.google.com/spreadsheets/d/e/2PACX-1vQqxYIY4s86E03NW7cnRPZn_pPmYuSKsWVHwwwK66wz4Bfh1FnpxKCcRMmhl8iBIzFYhL07SLWyJO72/pub?gid=421995879&single=true&output=csv")) {
        setErrorLog("يرجى تزويد السطر رقم 6 برابط الـ CSV الصحيح للشيت.");
        setLoading(false);
        return;
      }

      // استخدام بروتوكول جلب مرن مع كسر كاش المتصفح لضمان أحدث داتا
      const response = await fetch(`${GOOGLE_SHEET_CSV_URL}&nocache=${new Date().getTime()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const csvText = await response.text();
      
      // مفسر CSV داخلي ذكي (Lightweight Parser) لتجنب مشاكل استدعاء المكتبات الخارجية
      const lines = csvText.split(/\r?\n/);
      if (lines.length < 2) return;

      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      const jsonData = [];

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        
        //  مع الفواصل
        const currentLine = [];
        let insideQuote = false;
        let entry = "";
        
        for (let char of lines[i]) {
          if (char === '"') {
            insideQuote = !insideQuote;
          } else if (char === ',' && !insideQuote) {
            currentLine.push(entry.trim());
            entry = "";
          } else {
            entry += char;
          }
        }
        currentLine.push(entry.trim());

        if (currentLine.length === headers.length) {
          const rowObj = {};
          headers.forEach((header, index) => {
            rowObj[header] = currentLine[index]?.replace(/^"|"$/g, '');
          });
          jsonData.push(rowObj);
        }
      }

      if (jsonData.length > 0) {
        setRawData(jsonData);
        setErrorLog(null);
      }
    } catch (err) {
      console.error("Fetch API Failure:", err);
      setErrorLog(`فشل الاتصال السحابي: ${err.message}. تأكد من إعدادات النشر للعامة في جوجل شيت.`);
    } finally {
      setLoading(false);
    }
  };

  // المزامنة والريفرش الآلي كل دقيقة
  useEffect(() => {
    fetchSheetData();
    const interval = setInterval(() => {
      console.log("Auto-fetching fresh data from Google Sheets API...");
      fetchSheetData();
    }, 60000); // 60 ثانية

    return () => clearInterval(interval);
  }, []);

  // 🛠️ تفكيك الصفوف: جعل كل ملاحظة (منى أو عرفة) في صف (Row) مستقل تماماً للمشرفين
  const splitIssuesRows = useMemo(() => {
    const rows = [];

    rawData.forEach((row, idx) => {
      const centerId = row['رقم المركز']?.trim() || '';
      const name = row['المراكز']?.trim() || 'غير مدرج';
      const connection = row['حالة الاتصال']?.trim() || 'غير معروف';

      if (!centerId || centerId === '' || centerId.includes('رقم')) return;

      const minaNotes = row['ملاحظات منى']?.trim() || '';
      const minaUpdate = row['تحديث الملاحظات منى']?.trim() || '';
      
      const arafatNotes = row['ملاحظات عرفة']?.trim() || '';
      const arafatUpdate = row['تحديث الملاحظات عرفة']?.trim() || '';

      const hasMina = minaNotes !== '' && !minaNotes.includes('لا يوجد ملاحظات');
      const hasArafat = arafatNotes !== '' && !arafatNotes.includes('لا يوجد ملاحظات');

      if (hasMina) {
        const isMinaResolved = minaUpdate.includes('اصلاح') || minaUpdate.includes('تم') || minaUpdate.includes('تغيير');
        rows.push({
          key: `mina-${centerId}-${idx}`, id: centerId, name, connection, site: 'منى', notes: minaNotes,
          update: minaUpdate || '⚠️ لا يوجد تحديث ميداني من المراقب', status: isMinaResolved ? 'تم الحل' : 'مفتوحة'
        });
      }

      if (hasArafat) {
        const isArafatResolved = arafatUpdate.includes('اصلاح') || arafatUpdate.includes('تم') || arafatUpdate.includes('تغيير');
        rows.push({
          key: `arafat-${centerId}-${idx}`, id: centerId, name, connection, site: 'عرفة', notes: arafatNotes,
          update: arafatUpdate || '⚠️ لا يوجد تحديث ميداني من المراقب', status: isArafatResolved ? 'تم الحل' : 'مفتوحة'
        });
      }

      if (!hasMina && !hasArafat && connection.includes('لا يستجيب')) {
        rows.push({
          key: `conn-${centerId}-${idx}`, id: centerId, name, connection, site: 'منى / عرفة',
          notes: '🔴 المركز لا يستجيب للاتصال - يتطلب متابعة قناة التواصل وتحديثها', update: 'لا يوجد تحديث تواصل بعد', status: 'مفتوحة'
        });
      }
    });

    return rows;
  }, [rawData]);

  const filteredIssues = useMemo(() => {
    return splitIssuesRows.filter(item => {
      const matchSite = selectedSite === 'الكل' || item.site === selectedSite;
      const matchStatus = selectedStatus === 'الكل' || item.status === selectedStatus;
      const matchConn = connFilter === 'الكل' || item.connection.includes(connFilter);
      const text = `${item.id} ${item.name} ${item.notes} ${item.update}`.toLowerCase();
      return matchSite && matchStatus && matchConn && text.includes(searchQuery.toLowerCase());
    });
  }, [splitIssuesRows, selectedSite, selectedStatus, connFilter, searchQuery]);

  const stats = useMemo(() => {
    const totalIssues = splitIssuesRows.length;
    const openIssues = splitIssuesRows.filter(i => i.status === 'مفتوحة').length;
    const resolvedIssues = splitIssuesRows.filter(i => i.status === 'تم الحل').length;
    const noResponseCenters = new Set(splitIssuesRows.filter(i => i.connection.includes('لا يستجيب')).map(i => i.id)).size;
    const completionRate = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0;
    return { totalIssues, openIssues, resolvedIssues, noResponseCenters, completionRate };
  }, [splitIssuesRows]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-sans" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-medium">جاري إنشاء الاتصال السحابي المباشر بالـ API وسحب الداتا التشغيلية...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans text-right antialiased" dir="rtl">
      
      {/* هيدر غرفة العمليات التكنكل */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-950 p-6 rounded-2xl shadow-2xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-teal-500/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-teal-400 w-2.5 h-2.5 rounded-full animate-pulse"></span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">منظومة المراقبة الرقمية | بلاغات وتحديثات المشاعر المقدسة</h1>
          </div>
          <p className="text-teal-400 text-xs mt-1">قراءة مفككة عبر الـ API: كل ملاحظة في سجل (Row) مستقل تماماً لتسهيل الفرز الميداني</p>
        </div>
        <div className="bg-slate-900 text-slate-300 px-4 py-2 rounded-xl text-xs border border-teal-500/30">
          تحديث المزامنة: <span className="text-teal-400 font-bold">تلقائي (كل 60 ثانية)</span>
        </div>
      </div>

      {errorLog && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl text-xs font-medium mb-6">
          {errorLog}
        </div>
      )}

      {/* صف بطاقات المؤشرات (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-medium">إجمالي البلاغات المرصودة بالشيت</span>
          <span className="text-2xl font-extrabold text-white mt-2">{stats.totalIssues} <span className="text-xs font-normal text-slate-500">ملاحظة منفردة</span></span>
        </div>

        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs text-rose-400 font-medium">بلاغات معلقة (قيد المعالجة)</span>
          <span className="text-2xl font-extrabold text-rose-500 mt-2">{stats.openIssues} <span className="text-xs font-normal text-slate-500">حالة نشطة</span></span>
        </div>

        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs text-teal-400 font-medium">نسبة كفاءة إغلاق البلاغات</span>
          <div className="mt-2">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-2xl font-extrabold text-teal-400">{stats.completionRate}%</span>
              <span className="text-xs text-slate-500 font-medium">تم حل {stats.resolvedIssues}</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-teal-500 h-full" style={{ width: `${stats.completionRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-xs text-amber-500 font-medium">مراكز معلقة (لا تستجيب)</span>
          <span className="text-2xl font-extrabold text-amber-500 mt-2">{stats.noResponseCenters} <span className="text-xs font-normal text-slate-500">موقع</span></span>
        </div>
      </div>

      {/* شريط الفرز والتصفية */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">البحث المباشر</label>
            <input type="text" placeholder="رقم المركز، اسم المتعهد، البلاغ..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">حسب المشعر</label>
            <select className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200" value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)}>
              <option value="الكل">كل المشاعر (منى وعرفة)</option>
              <option value="منى">مشعر منى</option>
              <option value="عرفة">مشعر عرفة</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">وضعية البلاغ</label>
            <select className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="الكل">جميع الوضعيات</option>
              <option value="مفتوحة">معلقة / قيد العمل</option>
              <option value="تم الحل">مغلقة / تم الإصلاح</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">حالة الاتصال</label>
            <select className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200" value={connFilter} onChange={(e) => setConnFilter(e.target.value)}>
              <option value="الكل">جميع الحالات</option>
              <option value="تم التأكيد">تم التأكيد</option>
              <option value="لا يستجيب">لا يستجيب</option>
            </select>
          </div>
        </div>
      </div>

      {/* الجدول المفكك التكنكل */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900/40">
          <h2 className="font-bold text-sm text-slate-200">سجل البلاغات والتقارير الميدانية المفككة ({filteredIssues.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-center" style={{ width: '8%' }}>رقم المركز</th>
                <th className="p-3.5" style={{ width: '18%' }}>الشركة / المتعهد</th>
                <th className="p-3.5 text-center" style={{ width: '8%' }}>المشعر</th>
                <th className="p-3.5 text-center" style={{ width: '10%' }}>حالة الاتصال</th>
                <th className="p-3.5 text-slate-200" style={{ width: '26%' }}>الملاحظة المستلمة من المتعهد</th>
                <th className="p-3.5 text-slate-200" style={{ width: '22%' }}>تحديث وإصلاح المشرف الميداني</th>
                <th className="p-3.5 text-center" style={{ width: '10%' }}>الوضعية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs text-slate-300">
              {filteredIssues.length > 0 ? (
                filteredIssues.map((item) => (
                  <tr key={item.key} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-bold text-center text-white bg-slate-950/20">{item.id}</td>
                    <td className="p-3.5 font-medium text-slate-300">{item.name}</td>
                    <td className="p-3.5 text-center">
                      <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-md ${item.site === 'منى' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>{item.site}</span>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`inline-block px-2 py-0.5 font-bold rounded text-[10px] ${item.connection.includes('لا يستجيب') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'}`}>{item.connection}</span>
                    </td>
                    <td className="p-3.5 text-slate-100 font-medium whitespace-pre-line leading-relaxed">{item.notes}</td>
                    <td className="p-3.5 bg-slate-950/10">
                      {item.update.includes('⚠️') ? (
                        <span className="text-rose-400 font-bold text-[10px] animate-pulse">{item.update}</span>
                      ) : (
                        <div className="bg-emerald-500/5 p-2 rounded border-r-2 border-teal-500 text-teal-300 font-medium whitespace-pre-line leading-relaxed">{item.update}</div>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full ${item.status === 'تم الحل' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{item.status}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-500 font-medium">
                    لا توجد بلاغات تشغيلية نشطة حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}