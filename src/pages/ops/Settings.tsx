import { useState } from "react";
import clsx from "clsx";
import { SettingsSections, type SettingsTab } from "../admin/Capacity";
import { useAdminRole } from "../admin/useAdminRole";

// Settings, in four tabs instead of one long page: the same sections and saves as the current
// Settings page (Capacity.tsx). Full users only -- the server refuses changes from Matt too.

const TABS: [SettingsTab, string][] = [
  ["rules", "Booking rules"],
  ["trucks", "Trucks"],
  ["drivers", "Drivers"],
  ["off", "Days off & changes"],
];

export default function Settings() {
  const role = useAdminRole();
  const [tab, setTab] = useState<SettingsTab>("rules");
  if (role === "limited") return <p className="text-sm text-slate-600">Settings are for full dashboard users.</p>;
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-[26px] font-black text-navy">Settings</h1>
        <p className="mt-1 max-w-[62ch] text-sm text-slate-600">What the chat uses to offer customers free arrival times, plus your trucks, drivers and days off.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold", tab === id ? "border-action text-navy" : "border-transparent text-slate-500 hover:text-navy")}
          >
            {label}
          </button>
        ))}
      </div>
      <SettingsSections key={tab} only={tab} />
    </div>
  );
}
