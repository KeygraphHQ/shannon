import { useState, useEffect } from 'react'
import './App.css'

// --- Mock Data ---
const MOCK_JOBS = [
  { id: 'JOB-1029', tenant: 'Acme Corp', url: 'https://staging.acme.com', status: 'Completed', date: '2026-07-07 10:15', time: '1h 24m' },
  { id: 'JOB-1030', tenant: 'Globex Inc', url: 'https://dev.globex.io', status: 'Processing', date: '2026-07-07 11:30', time: '45m' },
  { id: 'JOB-1031', tenant: 'Soylent', url: 'https://test.soylent.co', status: 'Failed', date: '2026-07-07 12:05', time: '12m' },
  { id: 'JOB-1032', tenant: 'Initech', url: 'https://qa.initech.net', status: 'Pending', date: '2026-07-07 13:45', time: '--' },
  { id: 'JOB-1033', tenant: 'Umbrella', url: 'https://staging.umbrella.corp', status: 'Completed', date: '2026-07-07 14:20', time: '2h 10m' }
];

const MOCK_REVENUE = [
  { month: 'Jan', amount: 4200 },
  { month: 'Feb', amount: 5100 },
  { month: 'Mar', amount: 6800 },
  { month: 'Apr', amount: 8400 },
  { month: 'May', amount: 9200 },
  { month: 'Jun', amount: 12500 }
];

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [jobs, setJobs] = useState([]);
  const [revenue, setRevenue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        // Ojas: This will hit Utkarsh's API. Adjust the URL/port if needed (e.g., http://localhost:8080/api/shannon-scans)
        const response = await fetch('/api/shannon-scans').catch(() => null);
        
        if (response && response.ok) {
          const data = await response.json();
          // Assuming the API returns { scans: [...], revenue: [...] }
          setJobs(data.scans || MOCK_JOBS);
          setRevenue(data.revenue || MOCK_REVENUE);
        } else {
          throw new Error("API not ready yet");
        }
      } catch (err) {
        // Fallback to mock data so the UI doesn't break while Utkarsh is still building
        console.warn("Backend API not reachable, falling back to mock data:", err.message);
        setJobs(MOCK_JOBS);
        setRevenue(MOCK_REVENUE);
      } finally {
        setTimeout(() => setIsLoading(false), 300);
      }
    };

    fetchDashboardData();
  }, [activeTab]);

  const renderOverview = () => (
    <div style={{ animation: 'fadeUp 0.6s ease-out' }}>
      <div className="header">
        <div>
          <h2 className="text-gradient">Platform Overview</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '10px', fontSize: '1.1rem' }}>Real-time monitoring of Shannon scan workloads and platform health.</p>
        </div>
      </div>
      
      <div className="kpi-grid">
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-label">Total Scans (All Time)</div>
          <div className="kpi-value">1,284</div>
          <div className="kpi-trend trend-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
            12% this month
          </div>
        </div>
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-label">Active Tenants</div>
          <div className="kpi-value">48</div>
          <div className="kpi-trend trend-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            4 new this week
          </div>
        </div>
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.3s' }}>
          <div className="kpi-label">Scan Success Rate</div>
          <div className="kpi-value">94.2<span style={{ fontSize: '1.5rem', opacity: 0.7 }}>%</span></div>
          <div className="kpi-trend trend-down">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            1.1% from last week
          </div>
        </div>
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.4s' }}>
          <div className="kpi-label">MRR (Paid Scans)</div>
          <div className="kpi-value text-gradient-accent">$12.5<span style={{ fontSize: '1.5rem', opacity: 0.7 }}>k</span></div>
          <div className="kpi-trend trend-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
            18% this month
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ animationDelay: '0.5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3>Recent Scan Activity</h3>
          <button className="glass-button" onClick={() => setActiveTab('jobs')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>View All Jobs</button>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Tenant</th>
                <th>Target URL</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started At</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 3).map((job, i) => (
                <tr key={job.id} style={{ animation: `fadeUp 0.3s ease-out ${0.6 + (i*0.1)}s forwards`, opacity: 0 }}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>{job.id}</td>
                  <td className="tenant-name">{job.tenant}</td>
                  <td><a href="#" className="target-url">{job.url}</a></td>
                  <td>
                    <span className={`status-badge status-${job.status.toLowerCase()}`}>
                      {job.status === 'Processing' && <span style={{display: 'inline-block', width: '8px', height: '8px', borderTop: '2px solid', borderRight: '2px solid', borderRadius: '50%', animation: 'spin 1s linear infinite'}}></span>}
                      {job.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{job.time}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{job.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderJobs = () => (
    <div style={{ animation: 'fadeUp 0.6s ease-out' }}>
      <div className="header">
        <div>
          <h2 className="text-gradient">Shannon Scan Jobs</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '10px', fontSize: '1.1rem' }}>Manage, inspect, and track all tenant security scans.</p>
        </div>
        <button className="glass-button">
          <span style={{ marginRight: '8px', fontSize: '1.2rem' }}>+</span> 
          New Manual Scan
        </button>
      </div>

      <div className="glass-panel" style={{ animationDelay: '0.2s' }}>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '32px' }}>
          <input 
            type="text" 
            placeholder="Search by tenant or ID..." 
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
              color: 'white',
              padding: '14px 20px',
              borderRadius: '12px',
              width: '350px',
              fontSize: '0.95rem',
              outline: 'none',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent-secondary)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
          />
          <select style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-color)',
            color: 'white',
            padding: '14px 20px',
            borderRadius: '12px',
            fontSize: '0.95rem',
            outline: 'none',
            cursor: 'pointer'
          }}>
            <option>All Statuses</option>
            <option>Completed</option>
            <option>Processing</option>
            <option>Failed</option>
            <option>Pending</option>
          </select>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Tenant</th>
                <th>Target URL</th>
                <th>Status</th>
                <th>Started At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <tr key={job.id} style={{ animation: `fadeUp 0.3s ease-out ${0.3 + (i*0.1)}s forwards`, opacity: 0 }}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent-secondary)' }}>{job.id}</td>
                  <td className="tenant-name">{job.tenant}</td>
                  <td><a href="#" className="target-url">{job.url}</a></td>
                  <td>
                    <span className={`status-badge status-${job.status.toLowerCase()}`}>
                      {job.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{job.date}</td>
                  <td>
                    <button className="glass-button" style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderRevenue = () => (
    <div style={{ animation: 'fadeUp 0.6s ease-out' }}>
      <div className="header">
        <div>
          <h2 className="text-gradient">Revenue Tracking</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '10px', fontSize: '1.1rem' }}>Financial analytics and growth metrics for paid Shannon scans.</p>
        </div>
        <button className="glass-button">Export CSV</button>
      </div>

      <div className="kpi-grid">
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-label">Monthly Recurring Revenue</div>
          <div className="kpi-value text-gradient-accent">$12,500</div>
          <div className="kpi-trend trend-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
            18% vs last month
          </div>
        </div>
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-label">Paid Scans (This Month)</div>
          <div className="kpi-value">215</div>
          <div className="kpi-trend trend-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
            12% vs last month
          </div>
        </div>
        <div className="glass-panel kpi-card" style={{ animationDelay: '0.3s' }}>
          <div className="kpi-label">Average Revenue Per User</div>
          <div className="kpi-value">$260</div>
          <div className="kpi-trend trend-up">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
            5% vs last month
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '32px', animationDelay: '0.4s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Revenue Growth (H1 2026)</h3>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', gap: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{width: '12px', height: '12px', background: 'var(--accent-secondary)', borderRadius: '3px'}}></div> Scans</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{width: '12px', height: '12px', background: 'var(--accent-primary)', borderRadius: '3px'}}></div> Subscriptions</span>
          </div>
        </div>
        <div className="chart-container">
          {revenue.map((data, index) => {
            const heightPercentage = (data.amount / 12500) * 100;
            return (
              <div key={index} className="chart-bar-wrapper">
                <div style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700, opacity: 0, animation: `fadeUp 0.3s ease-out ${1 + (index*0.1)}s forwards` }}>
                  ${(data.amount / 1000).toFixed(1)}k
                </div>
                <div className="chart-bar" style={{ 
                  height: `${heightPercentage}%`, 
                  animationDelay: `${0.4 + (index * 0.1)}s` 
                }}></div>
                <div className="chart-label">{data.month}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <h1 className="text-gradient">Shannon</h1>
        </div>
        
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.15em', marginBottom: '16px', paddingLeft: '20px', fontWeight: 700 }}>
          Admin Platform
        </div>
        
        <ul className="nav-links">
          <li className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
            Dashboard
          </li>
          <li className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`} onClick={() => setActiveTab('jobs')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Scan Jobs
          </li>
          <li className={`nav-item ${activeTab === 'revenue' ? 'active' : ''}`} onClick={() => setActiveTab('revenue')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Revenue
          </li>
        </ul>

        <div className="system-status">
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>System Status</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="pulse-dot"></div>
            All Systems Operational
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div style={{ position: 'absolute', top: '40px', right: '48px', zIndex: 100 }}>
          <div className="user-profile glass-panel" style={{ padding: '6px', animation: 'fadeUp 0.8s ease-out', borderRadius: '50%' }}>
            <div className="avatar"></div>
          </div>
        </div>

        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'jobs' && renderJobs()}
        {activeTab === 'revenue' && renderRevenue()}
      </main>
    </div>
  )
}

export default App
