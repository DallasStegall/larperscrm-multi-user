# Feature Migration Guide

This document shows how to migrate existing LarpersCRM features from static/local data to live Supabase per-agent data.

---

## Overview

Each feature migration follows this pattern:

1. **Identify the data source** — What table in Supabase does this feature use?
2. **Load the data** — Query Supabase for the agent's rows
3. **Render from live data** — Replace static loops with dynamic renders
4. **Add CRUD handlers** — Create/Update/Delete rows in Supabase
5. **Test with multiple agents** — Verify RLS isolation

---

## Example: My Policies (Lead Entry)

### Current State

The "My Policies" page reads from a hard-coded `policies` array in the HTML:

```javascript
const policies = [
  {
    id: 1,
    carrier: 'Americo',
    product: 'FEX',
    status: 'Pending',
    monthly_premium: 32.50,
    annual_premium: 390,
    ...
  },
  // ... more hard-coded policies
];
```

### Target State

Read live from the `policies` table in Supabase:

```javascript
// Load the agent's policies from Supabase
const policies = await db.query('policies');
```

### Migration Steps

#### Step 1: Create a Load Function

In `larperscrm-dashboard.html`, find the My Policies page initialization. Add a function like:

```javascript
async function loadMyPolicies() {
  // Show loading state
  const policiesList = document.getElementById('policies-list');
  policiesList.innerHTML = '<p>Loading...</p>';

  // Fetch agent's policies from Supabase
  const policies = await db.query('policies');

  if (policies.length === 0) {
    policiesList.innerHTML = '<p>No policies yet. Add one to get started.</p>';
    return;
  }

  // Render each policy as a row
  let html = '';
  for (const policy of policies) {
    html += `
      <tr data-policy-id="${policy.id}">
        <td>${policy.carrier}</td>
        <td>${policy.product}</td>
        <td>${policy.status}</td>
        <td>$${policy.monthly_premium.toFixed(2)}</td>
        <td>$${policy.annual_premium.toFixed(2)}</td>
        <td>
          <button onclick="editPolicy('${policy.id}')">Edit</button>
          <button onclick="deletePolicy('${policy.id}')">Delete</button>
        </td>
      </tr>
    `;
  }

  policiesList.innerHTML = html;
}
```

#### Step 2: Update the Add/Edit Handler

When an agent adds a new policy via the "Manual Sale Entry" modal:

```javascript
async function addPolicy(formData) {
  const result = await db.insert('policies', {
    carrier: formData.carrier,
    product: formData.product,
    status: 'pending',
    monthly_premium: parseFloat(formData.monthly_premium),
    annual_premium: parseFloat(formData.annual_premium),
    face_amount: parseFloat(formData.face_amount),
    policy_number: formData.policy_number,
    sale_date: formData.sale_date,
    effective_date: formData.effective_date,
    reason: formData.reason,
  });

  if (result.success) {
    alert('Policy saved!');
    closeModal();
    loadMyPolicies(); // Refresh the list
  } else {
    alert('Error: ' + result.error);
  }
}
```

#### Step 3: Update the Edit Handler

```javascript
async function editPolicy(policyId) {
  const policies = await db.query('policies', { id: policyId });
  const policy = policies[0];

  if (!policy) {
    alert('Policy not found');
    return;
  }

  // Open modal and populate with policy data
  const modal = document.getElementById('policy-modal');
  document.getElementById('carrier-input').value = policy.carrier;
  document.getElementById('product-input').value = policy.product;
  // ... populate other fields
  document.getElementById('policy-modal').dataset.policyId = policyId;
  modal.style.display = 'flex';
}

async function saveEditedPolicy() {
  const policyId = document.getElementById('policy-modal').dataset.policyId;
  const updatedData = {
    carrier: document.getElementById('carrier-input').value,
    product: document.getElementById('product-input').value,
    // ... collect all form fields
  };

  const result = await db.update('policies', policyId, updatedData);

  if (result.success) {
    alert('Policy updated!');
    closeModal();
    loadMyPolicies();
  } else {
    alert('Error: ' + result.error);
  }
}
```

#### Step 4: Update the Delete Handler

```javascript
async function deletePolicy(policyId) {
  if (!confirm('Delete this policy?')) return;

  const result = await db.delete('policies', policyId);

  if (result.success) {
    alert('Policy deleted');
    loadMyPolicies();
  } else {
    alert('Error: ' + result.error);
  }
}
```

#### Step 5: Call Load on Page Entry

In the page navigation logic, when the user clicks on "My Policies":

```javascript
function showPoliciesPage() {
  // Show the My Policies page
  document.getElementById('my-policies-page').style.display = 'block';
  
  // Load live data
  loadMyPolicies();
}
```

---

## Pattern Template

Use this template for other features:

```javascript
// ============================================================================
// FEATURE: [Feature Name]
// TABLE: [supabase_table_name]
// ============================================================================

async function load[Feature]() {
  const data = await db.query('[table_name]');
  const container = document.getElementById('[container-id]');

  if (data.length === 0) {
    container.innerHTML = '<p>No [items] yet.</p>';
    return;
  }

  let html = '';
  for (const item of data) {
    html += `
      <div class="item" data-id="${item.id}">
        <!-- Render item fields -->
      </div>
    `;
  }

  container.innerHTML = html;
}

async function add[Item](formData) {
  const result = await db.insert('[table_name]', formData);
  if (result.success) {
    await load[Feature]();
  }
}

async function edit[Item](itemId, formData) {
  const result = await db.update('[table_name]', itemId, formData);
  if (result.success) {
    await load[Feature]();
  }
}

async function delete[Item](itemId) {
  const result = await db.delete('[table_name]', itemId);
  if (result.success) {
    await load[Feature]();
  }
}
```

---

## Testing Per-Agent Isolation

1. **Create two test accounts:**
   - Account A: `agentA@test.com`
   - Account B: `agentB@test.com`

2. **Log in as Account A** and add a policy (e.g., "Test Policy A")

3. **Log out** and **log in as Account B**

4. **Verify:** Account B does NOT see "Test Policy A"
   - This confirms RLS isolation is working

5. **Repeat for each feature**

---

## Features to Migrate (Priority Order)

### Phase 1: Core Data (Next)
- [ ] **My Policies** ← Start here (example above)
- [ ] **Lead Batches & Leads** (depends on My Policies working)
- [ ] **Carriers (HCMS)** — Read/write from `carrier_appointments`

### Phase 2: Calendar & Scheduling
- [ ] **Calendar** — Read/write from `appointments`
- [ ] **Face-to-Face** — Read/write from `f2f_sessions`

### Phase 3: Analytics & Integrations
- [ ] **Call Recordings** — File storage integration
- [ ] **Performance Metrics** — Aggregate live data
- [ ] **Integrations** — Manage webhooks in `integrations` table

---

## Common Pitfalls

### 1. Forgetting to include `agent_id`

❌ **Wrong:**
```javascript
const result = await db.insert('policies', {
  carrier: 'Americo',
  // ... missing agent_id
});
```

✅ **Correct:**
```javascript
// db.insert automatically adds agent_id
const result = await db.insert('policies', {
  carrier: 'Americo',
  // agent_id is added by db.insert()
});
```

### 2. Not awaiting async calls

❌ **Wrong:**
```javascript
const policies = db.query('policies'); // Missing await!
console.log(policies); // undefined
```

✅ **Correct:**
```javascript
const policies = await db.query('policies');
console.log(policies); // Array of policy objects
```

### 3. Hardcoding IDs

❌ **Wrong:**
```javascript
await db.delete('policies', 'hardcoded-id-123');
```

✅ **Correct:**
```javascript
await db.delete('policies', policy.id); // Use the actual policy's ID
```

---

## Performance Tips

1. **Load once, render many:** Fetch data once and cache it, don't refetch on every render
2. **Batch updates:** If updating multiple rows, consider doing them together
3. **Pagination:** For agents with 1000+ policies, implement pagination (load 50 at a time)
4. **Indexes:** Ask Fabian to ensure Supabase has indexes on `agent_id` (it does by default)

---

## Need Help?

If a feature migration isn't working:

1. **Open browser console** (`F12` in Chrome)
2. **Look for errors** — They'll show what went wrong
3. **Check the Supabase project** — Is the table there? Do the policies exist?
4. **Verify authentication** — Is `db.isAuthenticated()` true?

Example debug:
```javascript
// In browser console
await db.getProfile();    // Check if logged in
await db.query('policies'); // Try to fetch policies
```

---

## Next Phase

Once all features are migrated to live data:

1. **Test with real agents**
2. **Collect feedback** from Larpers Financial team
3. **Optimize UX** based on real usage
4. **Plan advanced features** (upline visibility, team targets, etc.)
