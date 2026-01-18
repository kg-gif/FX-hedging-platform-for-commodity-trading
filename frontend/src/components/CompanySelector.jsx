import React from 'react'
import { useCompany } from '../contexts/CompanyContext'

const CompanySelector = () => {
  const { 
    companies, 
    selectedCompanyId, 
    selectCompany, 
    loading,
    error,
    getSelectedCompany 
  } = useCompany()

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-600">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm">Loading companies...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm">
        Error loading companies
      </div>
    )
  }

  const selectedCompany = getSelectedCompany()

  return (
    <div className="flex items-center space-x-3">
      <span className="text-sm font-medium text-gray-700">Company:</span>
      <select
        value={selectedCompanyId || ''}
        onChange={(e) => selectCompany(parseInt(e.target.value))}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 font-medium cursor-pointer hover:border-gray-400 transition-colors"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      
      {selectedCompany && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
            {selectedCompany.base_currency}
          </span>
          <span className="text-gray-400">•</span>
          <span>
            ${(selectedCompany.trading_volume_monthly / 1_000_000).toFixed(1)}M monthly
          </span>
        </div>
      )}
    </div>
  )
}

export default CompanySelector
```

5. **Save the file** (Ctrl+S)

---

### **Step 3: Create MonteCarloSimulation.jsx**

1. **Navigate to:** `src/components/`

2. **Create a new file:** `MonteCarloSimulation.jsx`

3. **Open it in Notepad**

4. **This file is VERY long** (about 500 lines)

**Instead of pasting here, let me give you a simpler approach:**

Can you:
1. Go back to my previous message where I shared the **MonteCarloSimulation.jsx** code
2. Copy the ENTIRE code from that section
3. Paste it into your new `MonteCarloSimulation.jsx` file
4. Save it

**Or if you can't find it, let me know and I'll share it again!**

---

### **Step 4: Verify File Structure**

Your folder structure should now look like this:
```
src/
├── contexts/
│   └── CompanyContext.jsx  ✅ NEW
├── components/
│   ├── CompanySelector.jsx  ✅ NEW
│   ├── MonteCarloSimulation.jsx  ✅ NEW
│   ├── Dashboard.jsx  ✅ MODIFIED
│   ├── DataImportDashboard.jsx
│   └── ... (other components)
└── App.jsx  ✅ MODIFIED
```

---

### **Step 5: Push to GitHub Again**

1. **Open GitHub Desktop**

2. **Switch to your dashboard repository**

3. **You should now see:**
   - `src/contexts/CompanyContext.jsx` (new)
   - `src/components/CompanySelector.jsx` (new)
   - `src/components/MonteCarloSimulation.jsx` (new)

4. **In the Summary box, type:**
```
   Fix: Add missing context and component files