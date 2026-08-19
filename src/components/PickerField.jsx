function formatDate(value) {
  if (!value) return '選擇日期';
  return new Date(`${value}T12:00:00`).toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric' });
}

function formatDateTime(value) {
  if (!value) return '選擇日期與時間';
  return new Date(value).toLocaleString('zh-TW', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
}

export default function PickerField({ type, value, onChange, required, ariaLabel }) {
  const display = type === 'date' ? formatDate(value) : type === 'time' ? (value || '選擇時間') : formatDateTime(value);
  return <span className={`native-picker ${value ? '' : 'empty'}`}>
    <span aria-hidden="true">{display}</span>
    <input lang="zh-Hant-TW" type={type} value={value} onChange={onChange} required={required} aria-label={ariaLabel}/>
  </span>;
}
