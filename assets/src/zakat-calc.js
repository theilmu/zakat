(function(){
  class IlmuAlamZakat extends HTMLElement{
    constructor(){
      super();
      this.attachShadow({mode:'open'});
      // ---- Config ----
      this.cfg = {
        primary: this.getAttribute('primary') || '#249749',
        darkPrimary: this.getAttribute('dark-primary') || '#1c7a3a',
        brand: 'IlmuAlam',
        currency: 'MYR',
        // Default approach: user enters current gold price/gram (RM)
        defaultGoldRmPerGram: '',
        // Default fitrah/person (RM) – yearly & per state varies; keep editable
        defaultFitrahPerHead: '',
        version: '1.0.0'
      };
      // state
      this.state = {
        activeTab: 'pendapatan', // default tab
        nisabGoldPrice: this.cfg.defaultGoldRmPerGram,
        nisabGrams: 85, // Nisab emas standard
        fitrahPerHead: this.cfg.defaultFitrahPerHead
      };
      // restore from URL or localStorage
      this.restoreState();
      // render
      this.render();
    }

    // ---------- Utils ----------
    fmt(n){
      if(n===null || n===undefined || isNaN(n)) return 'RM 0.00';
      try{
        return new Intl.NumberFormat('ms-MY',{style:'currency',currency:'MYR',minimumFractionDigits:2}).format(n);
      }catch(e){
        return 'RM ' + (Math.round(n*100)/100).toFixed(2);
      }
    }
    num(v){ const n = parseFloat((v||'').toString().replace(/[, ]+/g,'')); return isNaN(n)?0:n; }
    pct(val){ return Math.max(0, this.num(val)); }
    save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
    load(k,d){ try{ const v = JSON.parse(localStorage.getItem(k)); return (v===null||v===undefined)?d:v; }catch(e){ return d; } }
    setQS(name,val){
      try{
        const u = new URL(location.href);
        u.hash = ''; // keep clean
        if(val===null) u.searchParams.delete(name); else u.searchParams.set(name,val);
        history.replaceState(null, '', u.toString());
      }catch(e){}
    }
    getQS(name){ try{ return (new URL(location.href)).searchParams.get(name); }catch(e){ return null; } }

    restoreState(){
      const ls = this.load('iaZakatState', {});
      Object.assign(this.state, ls);
      // tab from URL
      const qsTab = this.getQS('tab');
      if(qsTab) this.state.activeTab = qsTab;
    }

    persistState(){
      this.save('iaZakatState', this.state);
    }

    setTab(id){
      this.state.activeTab = id;
      this.setQS('tab', id);
      this.persistState();
      this.updateUI();
    }

    // ---------- Calculations ----------
    nisabAmount(){
      const price = this.num(this.shadowRoot.getElementById('goldPrice')?.value || this.state.nisabGoldPrice);
      const grams = this.num(this.shadowRoot.getElementById('nisabGrams')?.value || this.state.nisabGrams || 85);
      if(price<=0 || grams<=0) return 0;
      return price * grams;
    }

    zakatDue(amount){
      const n = this.num(amount);
      return (n>0) ? (n*0.025) : 0;
    }

    // each tab compute
    calcPendapatan(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      const incomeGross = g('inc_gross');
      const mandatory = g('inc_mand'); // KWSP, SOCSO, tax, etc.
      const essentials = g('inc_ess'); // keperluan asas (makan, sewa, utiliti)
      const others = g('inc_oth');     // hutang wajib, nafkah minima
      const period = this.shadowRoot.getElementById('inc_period')?.value || 'bulan';
      const basis = this.shadowRoot.getElementById('inc_basis')?.value || 'net';
      let net = (basis==='net')
        ? Math.max(0, incomeGross - mandatory - essentials - others)
        : Math.max(0, incomeGross - mandatory); // "simpanan" basis (alternatif)
      // convert to setahun if user chose bulanan:
      const yearly = (period==='bulan') ? net*12 : net;
      return { yearly, zakat: this.zakatDue(yearly) };
    }

    calcSimpanan(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      const cash = g('sav_cash');       // baki akhir haul
      const bank = g('sav_bank');
      const fd = g('sav_fd');           // fixed deposit
      const other = g('sav_other');
      const total = cash+bank+fd+other;
      return { total, zakat: this.zakatDue(total) };
    }

    calcEmasPerak(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      // Emas
      const emasPakai = g('gold_wear');   // berat emas dipakai (kadar uruf tempatan – opsyen)
      const emasSimpan = g('gold_keep');
      const emasPrice = this.num(this.shadowRoot.getElementById('goldPrice')?.value || this.state.nisabGoldPrice);
      const uruf = this.num(this.shadowRoot.getElementById('gold_uruf')?.value || 0); // gram dikecualikan (uruf – optional)

      const emasNV = Math.max(0, (emasSimpan + Math.max(0, emasPakai-uruf)) * emasPrice);

      // Perak
      const perakGram = g('silver_gram');
      const perakPrice = g('silver_price'); // RM/gram (user enters)
      const perakNV = perakGram * perakPrice;

      const total = emasNV + perakNV;
      return { total, zakat: this.zakatDue(total) };
    }

    calcPerniagaan(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      const aset = g('biz_assets');  // tunai, stok, A/R, pelaburan cair
      const liab = g('biz_liab');    // hutang jangka pendek
      const nett = Math.max(0, aset - liab);
      return { nett, zakat: this.zakatDue(nett) };
    }

    calcPelaburan(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      const asb = g('inv_asb');
      const th = g('inv_th');
      const saham = g('inv_stocks');
      const crypto = g('inv_crypto');
      const others = g('inv_others');
      const total = asb+th+saham+crypto+others;
      return { total, zakat: this.zakatDue(total) };
    }

    calcKWSP(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      const balance = g('kwsp_bal');     // akaun simpanan (diambilkira bila dikeluarkan / pendapatan)
      const withdrawn = g('kwsp_withd'); // jumlah pengeluaran tahun ini
      // Amalan: zakat 2.5% ke atas jumlah pengeluaran yang layak setahun
      const base = Math.max(0, withdrawn);
      return { base, zakat: this.zakatDue(base) };
    }

    calcFitrah(){
      const g = id => this.num(this.shadowRoot.getElementById(id)?.value);
      const heads = g('fit_heads');
      const rate = g('fit_rate') || this.num(this.state.fitrahPerHead);
      const total = heads * rate;
      return { total };
    }

    // ---------- Render ----------
    render(){
      const css = `
      :host{ --ia-primary:${this.cfg.primary}; --ia-primary-dark:${this.cfg.darkPrimary};
        --ia-bg:#ffffff; --ia-text:#0b1a10; --ia-muted:#6b7d70; --ia-border:#e3e8e5; --ia-soft:#f6faf7;
        --ia-radius:16px; --ia-gap:14px; font-synthesis-weight:none; }
      *{box-sizing:border-box}
      .app{font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ia-text)}
      .wrap{max-width:980px; margin:24px auto; padding:0 5px}
      .card{background:var(--ia-bg); border:1px solid var(--ia-border); border-radius:var(--ia-radius); box-shadow:0 1px 12px rgba(0,0,0,.04)}
      .header{padding:18px 18px 0}
      .title{display:flex; gap:10px; align-items:center}
      .logo{width:28px;height:28px;border-radius:8px;background:var(--ia-primary); display:inline-grid;place-items:center;color:#fff;font-weight:700}
      h1{font-size:20px; margin:0}
      .sub{color:var(--ia-muted); font-size:13px; margin:6px 0 0}
      .bar{margin:16px 18px 0; display:flex; flex-wrap:wrap; gap:8px}
      .tab{padding:10px 12px; border:1px solid var(--ia-border); border-radius:10px; background:var(--ia-soft); cursor:pointer; font-size:13px}
      .tab[aria-selected="true"]{background:var(--ia-primary); border-color:var(--ia-primary); color:#fff}
      .body{padding:18px}
      .grid{display:grid; grid-template-columns:1fr 1fr; gap:var(--ia-gap)}
      .grid-3{display:grid; grid-template-columns:repeat(3,1fr); gap:var(--ia-gap)}
      .grid-1{display:grid; gap:var(--ia-gap)}
      label{font-size:12px; color:var(--ia-muted)}
      input[type="number"], input[type="text"], select{
        width:100%; padding:10px 12px; border:1px solid var(--ia-border); border-radius:10px; background:#fff; font-size:14px; outline:none;
      }
      .muted{color:var(--ia-muted); font-size:12px}
      .note{padding:10px 12px; background:var(--ia-soft); border:1px dashed var(--ia-border); border-radius:12px; font-size:12px}
      .sum{display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; padding:12px 14px; background:linear-gradient(0deg, #f8fff9, #ffffff); border:1px solid var(--ia-border); border-radius:12px}
      .sum h3{font-size:16px; margin:0}
      .btns{display:flex; gap:10px; flex-wrap:wrap}
      button{padding:10px 12px; border-radius:10px; border:1px solid var(--ia-border); background:#fff; cursor:pointer; font-weight:600}
      .primary{background:var(--ia-primary); border-color:var(--ia-primary); color:#fff}
      .ghost{background:#fff}
      .section{margin-top:18px}
      .kpi{display:grid; grid-template-columns:repeat(2,1fr); gap:10px}
      .kpic{padding:12px; border:1px solid var(--ia-border); border-radius:12px; background:var(--ia-soft)}
      .kpic b{display:block; font-size:18px; margin-top:4px}
      .hr{height:1px; background:var(--ia-border); margin:18px 0}
      .foot{padding:0 18px 18px; display:flex; justify-content:space-between; align-items:center; color:var(--ia-muted); font-size:12px}
      .link{color:var(--ia-primary-dark); text-decoration:underline; cursor:pointer}
      .danger{color:#a91919}
      @media(max-width:720px){ .grid, .grid-3{grid-template-columns:1fr} }
      @media print{
        .bar, .btns, .foot{display:none !important}
        .wrap{max-width:none; margin:0; padding:0}
        .card{border:none; box-shadow:none}
        .kpic{background:#fff}
      }
      `;
      const html = `
        <div class="app">
          <div class="wrap">
            <div class="card">
              <div class="header">
                <div class="title">
                  <div class="logo">IA</div>
                  <div>
                    <h1>Kalkulator Zakat IlmuAlam</h1>
                    <p class="sub">Kira pelbagai jenis zakat dengan kadar 2.5% (haul setahun) & nisab berasaskan emas. Semua di satu tempat.</p>
                  </div>
                </div>
                <div class="bar" role="tablist" aria-label="Jenis Zakat">
                  ${this.tabBtn('pendapatan','Pendapatan')}
                  ${this.tabBtn('simpanan','Simpanan')}
                  ${this.tabBtn('emas','Emas/Perak')}
                  ${this.tabBtn('perniagaan','Perniagaan')}
                  ${this.tabBtn('pelaburan','Pelaburan/ASB/TH/Saham/Crypto')}
                  ${this.tabBtn('kwsp','KWSP (Pengeluaran)')}
                  ${this.tabBtn('fitrah','Zakat Fitrah')}
                  ${this.tabBtn('info','Info & Nisab')}
                </div>
              </div>
              <div class="body" id="view"></div>
              <div class="foot">
                <span>© ${new Date().getFullYear()} ${this.cfg.brand} • v${this.cfg.version}</span>
                <span><span class="link" id="printBtn">Cetak / Simpan PDF</span> · <span class="link" id="resetBtn">Set Semula</span></span>
              </div>
            </div>
          </div>
        </div>
      `;
      this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
      this.updateUI();
      this.shadowRoot.getElementById('printBtn').addEventListener('click', ()=>window.print());
      this.shadowRoot.getElementById('resetBtn').addEventListener('click', ()=>{
        localStorage.removeItem('iaZakatState');
        this.state = {activeTab:'pendapatan', nisabGoldPrice:this.cfg.defaultGoldRmPerGram, nisabGrams:85, fitrahPerHead:this.cfg.defaultFitrahPerHead};
        this.updateUI();
      });
    }

    tabBtn(id,label){
      const sel = (this.state.activeTab===id) ? 'true':'false';
      return `<button class="tab" role="tab" aria-selected="${sel}" data-tab="${id}">${label}</button>`;
    }

    bindTabs(){
      [...this.shadowRoot.querySelectorAll('.tab')].forEach(btn=>{
        btn.addEventListener('click', ()=>this.setTab(btn.dataset.tab));
      });
    }

    viewPendapatan(){
      const v = `
        <div class="grid">
          <div>
            <label>Jumlah pendapatan kasar <small>(bulanan / tahunan)</small></label>
            <input id="inc_gross" type="number" placeholder="cth: 5000" inputmode="decimal">
          </div>
          <div>
            <label>Potongan wajib (KWSP, SOCSO, cukai)</label>
            <input id="inc_mand" type="number" placeholder="cth: 800" inputmode="decimal">
          </div>
          <div>
            <label>Keperluan asas (makan/minum, sewa, utiliti)</label>
            <input id="inc_ess" type="number" placeholder="cth: 1500" inputmode="decimal">
          </div>
          <div>
            <label>Hutang wajib / nafkah perlu</label>
            <input id="inc_oth" type="number" placeholder="cth: 400" inputmode="decimal">
          </div>
          <div>
            <label>Tempoh</label>
            <select id="inc_period">
              <option value="bulan">Bulanan</option>
              <option value="tahun">Tahunan</option>
            </select>
          </div>
          <div>
            <label>Asas pengiraan</label>
            <select id="inc_basis">
              <option value="net">Pendapatan bersih (disyorkan)</option>
              <option value="simpanan">Pendekatan simpanan</option>
            </select>
          </div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Pendapatan layak dizakat (setahun)</span><b id="inc_yearly">RM 0.00</b></div>
            <div class="kpic"><span>Zakat 2.5% (setahun)</span><b id="inc_zakat">RM 0.00</b></div>
          </div>
          <div class="btns">
            <button class="primary" id="inc_copy">Salin jumlah zakat</button>
            <button class="ghost" id="inc_monthly">Tukar ke ansuran bulanan</button>
          </div>
        </div>
        <p class="note">Nota: Jika jumlah layak melepasi nisab setahun (lihat tab “Info & Nisab”), zakat 2.5% ditunaikan. Amalan di Malaysia turut menerima kaedah potongan bulanan.</p>
      `;
      return v;
    }

    viewSimpanan(){
      return `
        <div class="grid">
          <div><label>Tunai</label><input id="sav_cash" type="number" placeholder="cth: 800" inputmode="decimal"></div>
          <div><label>Bank (baki hujung haul)</label><input id="sav_bank" type="number" placeholder="cth: 5000" inputmode="decimal"></div>
          <div><label>Fixed Deposit</label><input id="sav_fd" type="number" placeholder="cth: 3000" inputmode="decimal"></div>
          <div><label>Lain-lain simpanan cair</label><input id="sav_other" type="number" placeholder="cth: 0" inputmode="decimal"></div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Jumlah simpanan</span><b id="sav_total">RM 0.00</b></div>
            <div class="kpic"><span>Zakat 2.5%</span><b id="sav_zakat">RM 0.00</b></div>
          </div>
          <div class="btns"><button class="primary" id="sav_copy">Salin jumlah zakat</button></div>
        </div>
      `;
    }

    viewEmas(){
      return `
        <div class="grid">
          <div><label>Harga emas (RM/gram)</label><input id="goldPrice" type="number" placeholder="cth: 350" inputmode="decimal" value="${this.state.nisabGoldPrice||''}"></div>
          <div><label>Nisab (gram emas)</label><input id="nisabGrams" type="number" value="${this.state.nisabGrams||85}" inputmode="decimal"></div>

          <div><label>Emas dipakai (gram)</label><input id="gold_wear" type="number" placeholder="cth: 50" inputmode="decimal"></div>
          <div><label>Emas simpanan (gram)</label><input id="gold_keep" type="number" placeholder="cth: 30" inputmode="decimal"></div>

          <div><label>Uruf (gram dikecualikan – opsyen setempat)</label><input id="gold_uruf" type="number" placeholder="cth: 0" inputmode="decimal"></div>
          <div><label>Perak (gram)</label><input id="silver_gram" type="number" placeholder="cth: 0" inputmode="decimal"></div>
          <div><label>Harga perak (RM/gram)</label><input id="silver_price" type="number" placeholder="cth: 3.5" inputmode="decimal"></div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Anggaran nilai emas+perak</span><b id="gp_total">RM 0.00</b></div>
            <div class="kpic"><span>Zakat 2.5%</span><b id="gp_zakat">RM 0.00</b></div>
          </div>
          <div class="btns">
            <button class="primary" id="gp_copy">Salin jumlah zakat</button>
            <button class="ghost" id="gp_nisab">Kira Nisab</button>
          </div>
        </div>
        <p class="note">Nisab = harga emas/gram × 85 gram. Uruf adalah toleransi pemakaian emas (bergantung fatwa negeri).</p>
      `;
    }

    viewPerniagaan(){
      return `
        <div class="grid">
          <div><label>Aset semasa (tunai, stok, A/R, pelaburan cair)</label><input id="biz_assets" type="number" placeholder="cth: 120000" inputmode="decimal"></div>
          <div><label>Liabiliti semasa (hutang jangka pendek)</label><input id="biz_liab" type="number" placeholder="cth: 50000" inputmode="decimal"></div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Modal kerja layak dizakat</span><b id="biz_nett">RM 0.00</b></div>
            <div class="kpic"><span>Zakat 2.5%</span><b id="biz_zakat">RM 0.00</b></div>
          </div>
          <div class="btns"><button class="primary" id="biz_copy">Salin jumlah zakat</button></div>
        </div>
      `;
    }

    viewPelaburan(){
      return `
        <div class="grid-3">
          <div><label>ASB (nilai semasa)</label><input id="inv_asb" type="number" placeholder="cth: 10000" inputmode="decimal"></div>
          <div><label>Tabung Haji (nilai semasa)</label><input id="inv_th" type="number" placeholder="cth: 8000" inputmode="decimal"></div>
          <div><label>Saham (nilai pasaran)</label><input id="inv_stocks" type="number" placeholder="cth: 6000" inputmode="decimal"></div>
          <div><label>Crypto (nilai pasaran)</label><input id="inv_crypto" type="number" placeholder="cth: 0" inputmode="decimal"></div>
          <div><label>Pelaburan lain</label><input id="inv_others" type="number" placeholder="cth: 0" inputmode="decimal"></div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Jumlah pelaburan layak</span><b id="inv_total">RM 0.00</b></div>
            <div class="kpic"><span>Zakat 2.5%</span><b id="inv_zakat">RM 0.00</b></div>
          </div>
          <div class="btns"><button class="primary" id="inv_copy">Salin jumlah zakat</button></div>
        </div>
        <p class="note">Jika pelaburan memenuhi haul dan melepasi nisab, zakat 2.5% ditunaikan. Untuk dana patuh syariah, rujuk garis panduan institusi.</p>
      `;
    }

    viewKWSP(){
      return `
        <div class="grid">
          <div><label>Jumlah pengeluaran KWSP tahun ini</label><input id="kwsp_withd" type="number" placeholder="cth: 10000" inputmode="decimal"></div>
          <div><label>Baki akaun (rujukan)</label><input id="kwsp_bal" type="number" placeholder="cth: 80000" inputmode="decimal"></div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Asas zakat (pengeluaran)</span><b id="kwsp_base">RM 0.00</b></div>
            <div class="kpic"><span>Zakat 2.5%</span><b id="kwsp_zakat">RM 0.00</b></div>
          </div>
          <div class="btns"><button class="primary" id="kwsp_copy">Salin jumlah zakat</button></div>
        </div>
        <p class="note">Amalan lazim: zakat ke atas jumlah yang <em>dikeluarkan</em> setahun, bukan keseluruhan baki (kecuali ditakrifkan sebagai pendapatan/simpanan menurut negeri).</p>
      `;
    }

    viewFitrah(){
      return `
        <div class="grid">
          <div><label>Bilangan tanggungan (termasuk diri sendiri)</label><input id="fit_heads" type="number" placeholder="cth: 5" inputmode="decimal"></div>
          <div><label>Kadar fitrah / seorang (RM)</label><input id="fit_rate" type="number" placeholder="cth: 7" inputmode="decimal" value="${this.state.fitrahPerHead||''}"></div>
        </div>
        <div class="section sum">
          <h3>Hasil</h3>
          <div class="kpi">
            <div class="kpic"><span>Jumlah zakat fitrah</span><b id="fit_total">RM 0.00</b></div>
          </div>
          <div class="btns"><button class="primary" id="fit_copy">Salin jumlah</button></div>
        </div>
        <p class="note">Kadar fitrah berbeza mengikut negeri & tahun (beras asas). Masukkan kadar rasmi semasa daripada Majlis Agama Islam negeri.</p>
      `;
    }

    viewInfo(){
      const nisab = this.nisabAmount();
      return `
        <div class="grid">
          <div>
            <label>Harga emas (RM/gram) – masukkan harga semasa</label>
            <input id="goldPrice" type="number" placeholder="cth: 350" inputmode="decimal" value="${this.state.nisabGoldPrice||''}">
          </div>
          <div>
            <label>Nisab (gram emas)</label>
            <input id="nisabGrams" type="number" inputmode="decimal" value="${this.state.nisabGrams||85}">
          </div>
        </div>
        <div class="section sum">
          <h3>Nisab Semasa</h3>
          <div class="kpi">
            <div class="kpic"><span>Nisab (RM)</span><b id="info_nisab">${this.fmt(nisab)}</b></div>
            <div class="kpic"><span>Kadar zakat</span><b>2.5% (1/40)</b></div>
          </div>
          <div class="btns">
            <button class="ghost" id="info_save">Simpan nilai nisab</button>
            <button class="ghost" id="info_share">Kongsi pautan tab ini</button>
          </div>
        </div>
        <div class="hr"></div>
        <div class="grid-1">
          <div class="note">
            <b>Penafian:</b> Kalkulator ini menyediakan anggaran umum berasaskan kaedah lazim di Malaysia.
            Rujuk Majlis Agama Islam negeri / pusat zakat untuk ketetapan semasa (kadar uruf, kadar fitrah, garis panduan khas).
          </div>
        </div>
      `;
    }

    updateUI(){
      const view = this.shadowRoot.getElementById('view');
      const tab = this.state.activeTab;
      let content = '';
      if(tab==='pendapatan') content = this.viewPendapatan();
      if(tab==='simpanan') content = this.viewSimpanan();
      if(tab==='emas') content = this.viewEmas();
      if(tab==='perniagaan') content = this.viewPerniagaan();
      if(tab==='pelaburan') content = this.viewPelaburan();
      if(tab==='kwsp') content = this.viewKWSP();
      if(tab==='fitrah') content = this.viewFitrah();
      if(tab==='info') content = this.viewInfo();
      view.innerHTML = content;

      // colorize
      this.shadowRoot.adoptedStyleSheets = [];
      // bind tabs
      this.bindTabs();
      // bind calculators
      this.bindCalcs(tab);
    }

    bindCalcs(tab){
      const on = (id, ev, fn) => {
        const el = this.shadowRoot.getElementById(id);
        if(el) el.addEventListener(ev, fn);
      };
      const re = ()=>this.recalc(tab);

      // generic bind all inputs to recalc & persist
      this.shadowRoot.querySelectorAll('input,select').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          // persist shared fields
          if(inp.id==='goldPrice'){ this.state.nisabGoldPrice = inp.value; this.persistState(); }
          if(inp.id==='nisabGrams'){ this.state.nisabGrams = inp.value; this.persistState(); }
          if(inp.id==='fit_rate'){ this.state.fitrahPerHead = inp.value; this.persistState(); }
          this.recalc(tab);
        });
        inp.addEventListener('change', ()=>this.recalc(tab));
      });

      // buttons
      const copyVal = (val)=>{
        if(navigator.clipboard) navigator.clipboard.writeText(val);
        alert('Disalin: ' + val);
      };

      if(tab==='pendapatan'){
        on('inc_copy','click', ()=>{
          const {zakat} = this.calcPendapatan();
          copyVal(this.fmt(zakat));
        });
        on('inc_monthly','click', ()=>{
          const {zakat} = this.calcPendapatan();
          const monthly = zakat/12;
          alert('Cadangan ansuran bulanan: ' + this.fmt(monthly));
        });
      }
      if(tab==='simpanan') on('sav_copy','click', ()=>{ const {zakat}=this.calcSimpanan(); copyVal(this.fmt(zakat)); });
      if(tab==='emas'){
        on('gp_copy','click', ()=>{ const {zakat}=this.calcEmasPerak(); copyVal(this.fmt(zakat)); });
        on('gp_nisab','click', ()=>{
          const n = this.nisabAmount();
          alert('Nisab semasa (anggaran): ' + this.fmt(n));
        });
      }
      if(tab==='perniagaan') on('biz_copy','click', ()=>{ const {zakat}=this.calcPerniagaan(); copyVal(this.fmt(zakat)); });
      if(tab==='pelaburan') on('inv_copy','click', ()=>{ const {zakat}=this.calcPelaburan(); copyVal(this.fmt(zakat)); });
      if(tab==='kwsp') on('kwsp_copy','click', ()=>{ const {zakat}=this.calcKWSP(); copyVal(this.fmt(zakat)); });
      if(tab==='fitrah') on('fit_copy','click', ()=>{ const {total}=this.calcFitrah(); copyVal(this.fmt(total)); });
      if(tab==='info'){
        on('info_save','click', ()=>{
          this.persistState();
          alert('Nilai disimpan untuk sesi ini.');
        });
        on('info_share','click', ()=>{
          navigator.clipboard?.writeText(location.href);
          alert('Pautan semasa disalin.');
        });
      }

      // initial calc
      this.recalc(tab);
    }

    recalc(tab){
      const set = (id,val)=>{ const el=this.shadowRoot.getElementById(id); if(el) el.textContent=(typeof val==='number')?this.fmt(val):val; };

      if(tab==='pendapatan'){
        const {yearly,zakat} = this.calcPendapatan();
        set('inc_yearly', yearly);
        set('inc_zakat', zakat);
      }
      if(tab==='simpanan'){
        const {total,zakat} = this.calcSimpanan();
        set('sav_total', total);
        set('sav_zakat', zakat);
      }
      if(tab==='emas'){
        const {total,zakat} = this.calcEmasPerak();
        set('gp_total', total);
        set('gp_zakat', zakat);
      }
      if(tab==='perniagaan'){
        const {nett,zakat} = this.calcPerniagaan();
        set('biz_nett', nett);
        set('biz_zakat', zakat);
      }
      if(tab==='pelaburan'){
        const {total,zakat} = this.calcPelaburan();
        set('inv_total', total);
        set('inv_zakat', zakat);
      }
      if(tab==='kwsp'){
        const {base,zakat} = this.calcKWSP();
        set('kwsp_base', base);
        set('kwsp_zakat', zakat);
      }
      if(tab==='fitrah'){
        const {total} = this.calcFitrah();
        set('fit_total', total);
      }
      if(tab==='info'){
        const n = this.nisabAmount();
        const el = this.shadowRoot.getElementById('info_nisab'); if(el) el.textContent = this.fmt(n);
      }
    }
  }

  customElements.define('ilmualam-zakat', IlmuAlamZakat);
  // mount component
  const root = document.getElementById('ia-zakat-root');
  const el = document.createElement('ilmualam-zakat');
  el.setAttribute('primary', '#249749');
  el.setAttribute('dark-primary', '#1c7a3a');
  root.appendChild(el);
})();
