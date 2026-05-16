// IOF XML 3.0 ResultList export — mirrors apps/web/src/lib/screens/ExportView.svelte
// Final / Provisional toggle → re-validates against IOF.xsd → enables download.
const { useState: useStateE, useMemo: useMemoE } = React;

function ExportView({ t }) {
  const [status, setStatus] = useStateE('Final');
  const [validating, setValidating] = useStateE(false);
  const [preview, setPreview] = useStateE(null); // { valid, summary, errors, xml }
  const [showXml, setShowXml] = useStateE(false);

  // Stub: simulate the bridge's POST /api/competitions/:id/export?status=...
  const refresh = (nextStatus) => {
    setValidating(true);
    setShowXml(false);
    setTimeout(() => {
      const classes = (window.MOCK_CLASSES || []).length;
      const personResults = Object.values(window.MOCK_RESULTS || {}).reduce(
        (a, rs) => a + rs.filter(r => r.status === 'OK' || r.status === 'MP').length, 0
      );
      const valid = true; // both Final and Provisional shapes validate in this mock
      setPreview({
        valid,
        summary: { class_count: classes, person_result_count: personResults, status: nextStatus },
        errors: [],
        xml: buildXmlSample(nextStatus, classes, personResults),
      });
      setValidating(false);
    }, 620);
  };

  // Run once on mount (and on status flip)
  React.useEffect(() => { refresh(status); }, [status]);

  const canDownload = preview && preview.valid && !validating;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760}}>
      <style>{`
        .exp-sec { display: flex; flex-direction: column; gap: 10px; }
        .exp-sec h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.005em; }
        .exp-box { border-radius: var(--radius); padding: 14px 18px; }
        .exp-box.ok { background: var(--ok-soft); border: 1px solid var(--ok); }
        .exp-box.err { background: var(--dnf-soft); border: 1px solid var(--dnf); }
        .exp-box.info { background: var(--bg-sunken); border: 1px solid var(--border); }
        .exp-box strong { font-weight: 600; }
        .exp-radio {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 12px 16px;
          border: 1px solid var(--border-strong);
          background: var(--bg-elev);
          border-radius: var(--radius);
          font-size: 14px; font-weight: 500;
          cursor: pointer;
          transition: border 0.12s, background 0.12s;
        }
        .exp-radio.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
        .exp-radio input { accent-color: var(--accent); }
        .exp-radio-group { display: flex; gap: 10px; flex-wrap: wrap; }

        .xml-preview {
          background: #1a1a22; color: #e6edf3;
          padding: 18px 22px;
          border-radius: var(--radius);
          font-family: var(--font-mono);
          font-size: 12px; line-height: 1.55;
          overflow: auto;
          max-height: 360px;
          white-space: pre;
          tab-size: 2;
        }
        .xml-preview .tag { color: #ff7b72; }
        .xml-preview .attr { color: #d2a8ff; }
        .xml-preview .val { color: #a5d6ff; }
        .xml-preview .cmt { color: #8b949e; font-style: italic; }
      `}</style>

      <header>
        <h1 className="h0">{t('exp.title')}</h1>
        <p className="muted" style={{marginTop: 6, maxWidth: 640}}>{t('exp.subtitle')}</p>
      </header>

      <div className="exp-sec">
        <h2>{t('exp.type')}</h2>
        <div className="exp-radio-group">
          {['Final', 'Provisional'].map(s => (
            <label key={s} className={'exp-radio ' + (status === s ? 'active' : '')}>
              <input type="radio" name="exp-status" value={s} checked={status === s}
                onChange={() => setStatus(s)} />
              <span>{s === 'Final' ? t('exp.final') : t('exp.provisional')}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="exp-sec">
        <h2>{t('exp.validation')}</h2>
        {validating && (
          <div className="exp-box info" style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)',
              animation: 'spin 0.9s linear infinite', display: 'inline-block',
            }}></span>
            <span style={{color: 'var(--fg-muted)'}}>{t('exp.validating')}</span>
          </div>
        )}
        {!validating && preview && preview.valid && (
          <div className="exp-box ok">
            <strong style={{color: 'var(--ok)'}}>✓ {t('exp.valid')}</strong>
            <div style={{marginTop: 4, fontSize: 13, color: 'var(--fg)'}}>
              {t('exp.validRow')
                .replace('{classes}', preview.summary.class_count)
                .replace('{persons}', preview.summary.person_result_count)
                .replace('{status}', preview.summary.status)}
            </div>
            <div style={{marginTop: 6, fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)'}}>
              IOF.xsd v3.0 · libxmljs2 · 0 fel
            </div>
          </div>
        )}
        {!validating && preview && !preview.valid && (
          <div className="exp-box err">
            <strong style={{color: 'var(--dnf)'}}>✗ {t('exp.invalid')}</strong>
            <ul style={{margin: '8px 0 0', paddingLeft: 20}}>
              {preview.errors.map((e, i) => (
                <li key={i} style={{fontSize: 13}}>
                  {e.line != null && <span className="mono" style={{color: 'var(--fg-muted)', marginRight: 6}}>rad {e.line}:</span>}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="exp-sec">
        <h2>{t('exp.download.section')}</h2>
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
          <a className="btn primary lg"
            href={canDownload ? '#download' : undefined}
            onClick={e => { if (!canDownload) { e.preventDefault(); return; } e.preventDefault(); /* mock */ }}
            style={!canDownload ? {opacity: 0.5, pointerEvents: 'none'} : null}>
            {t('exp.download')}
          </a>
          <button className="btn ghost" onClick={() => setShowXml(v => !v)} disabled={!preview}>
            {showXml ? '▾ ' : '▸ '}{t('exp.preview')}
          </button>
          <span className="faint mono" style={{fontSize: 12, marginLeft: 'auto'}}>
            tisdagsträning-v20-resultlist.xml · ~{preview ? Math.round(preview.xml.length / 102.4) / 10 : '—'} kB
          </span>
        </div>

        {showXml && preview && (
          <pre className="xml-preview" dangerouslySetInnerHTML={{ __html: highlightXml(preview.xml) }}></pre>
        )}
      </div>

      <div className="exp-box info" style={{display: 'flex', gap: 14, alignItems: 'flex-start'}}>
        <span style={{
          width: 32, height: 32, flexShrink: 0,
          background: 'var(--accent-soft)', color: 'var(--accent-strong)',
          borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontWeight: 700,
        }}>i</span>
        <div style={{fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5}}>
          {t('exp.note')}
        </div>
      </div>
    </div>
  );
}

function buildXmlSample(status, classCount, personCount) {
  // Trimmed but structurally faithful IOF XML 3.0 ResultList sample.
  const today = '2026-05-13';
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ResultList xmlns="http://www.orienteering.org/datastandard/3.0"
            iofVersion="3.0"
            createTime="${now}"
            creator="FartOL v0.1.0-phase1"
            status="${status}">
  <Event>
    <Id>tisdag-v20</Id>
    <Name>Tisdagsträning v.20</Name>
    <StartTime><Date>${today}</Date><Time>17:00:00+02:00</Time></StartTime>
    <Organiser>
      <Id>storTuna-ok</Id>
      <Name>StorTuna OK</Name>
    </Organiser>
    <Form>Individual</Form>
  </Event>
  <ClassResult>
    <Class>
      <Id>H21</Id>
      <Name>H21</Name>
    </Class>
    <Course>
      <Length>6400</Length>
      <Climb>110</Climb>
      <NumberOfControls>14</NumberOfControls>
    </Course>
    <PersonResult>
      <Person sex="M">
        <Name><Family>Lindqvist</Family><Given>Erik</Given></Name>
      </Person>
      <Organisation>
        <Id>storTuna-ok</Id>
        <Name>StorTuna OK</Name>
      </Organisation>
      <Result>
        <StartTime>${today}T13:54:00+02:00</StartTime>
        <FinishTime>${today}T14:32:11+02:00</FinishTime>
        <Time>2291</Time>
        <TimeBehind>0</TimeBehind>
        <Position>1</Position>
        <Status>OK</Status>
        <ControlCard punchingSystem="SI">2078451</ControlCard>
        <SplitTime><ControlCode>31</ControlCode><Time>46</Time></SplitTime>
        <SplitTime><ControlCode>45</ControlCode><Time>138</Time></SplitTime>
        <!-- … ${classCount - 1} more classes, ${personCount - 1} more PersonResult elements … -->
      </Result>
    </PersonResult>
  </ClassResult>
</ResultList>`;
}

function highlightXml(xml) {
  return xml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="cmt">$1</span>')
    .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="tag">$2</span>')
    .replace(/([\w:-]+)=("[^"]*")/g, '<span class="attr">$1</span>=<span class="val">$2</span>');
}

Object.assign(window, { ExportView });
