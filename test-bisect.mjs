import mermaid from 'mermaid';
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const cases = {
  'a subgraph id[无空格标题]': `flowchart TD
  subgraph nsrm_x[VendorApproval]
    n1["A"]
  end`,
  'b subgraph id[带空格标题]': `flowchart TD
  subgraph nsrm_x[Vendor Quote Approval]
    n1["A"]
  end`,
  'c subgraph id["带空格标题"]': `flowchart TD
  subgraph nsrm_x["Vendor Quote Approval"]
    n1["A"]
  end`,
  'd subgraph + direction TD(在同层)': `flowchart TD
  subgraph nsrm_x
    direction TD
    n1["A"]
  end`,
  'e subgraph[""] + direction TD': `flowchart TD
  subgraph nsrm_x["Vendor Quote Approval"]
    direction TD
    n1["A"]
  end`,
  'f subgraph + direction LR': `flowchart TD
  subgraph nsrm_x["X"]
    direction LR
    n1["A"]
  end`,
};

for (const [name, code] of Object.entries(cases)) {
  try {
    await mermaid.parse(code);
    console.log(`✓ ${name}`);
  } catch (e) {
    const msg = String(e.message || e);
    console.log(`✗ ${name} → ${msg.includes('DOMPurify') ? 'DOMPurify(环境)' : msg.split('\n')[0]}`);
  }
}
