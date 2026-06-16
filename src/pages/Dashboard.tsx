import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Plane, Upload, FileText, Layout, LogOut, Plus, Trash2, 
  Edit3, Download, Eye, CheckCircle, RefreshCw, AlertCircle, Save 
} from 'lucide-react';

interface Invoice {
  _id: string;
  passengerName: string | null;
  pnr: string | null;
  airline: string | null;
  flightNumber: string | null;
  departure: string | null;
  destination: string | null;
  travelDate: string | null;
  amount: number | null;
  currency: string | null;
  rawOcrText: string;
  templateId?: string | null;
  pdfPath?: string | null;
  createdAt: string;
}

interface Template {
  _id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  customCss?: string;
}

export const Dashboard: React.FC = () => {
  const { user, token, logout } = useAuth();
  
  // State
  const [activeTab, setActiveTab] = useState<'invoices' | 'templates'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  
  // Active Invoice Workflow
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isEditingInvoice, setIsEditingInvoice] = useState(false);
  const [editedFields, setEditedFields] = useState<Partial<Invoice>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  
  // Active Template Workflow
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    primaryColor: '#1e3a8a',
    secondaryColor: '#3b82f6',
    logoUrl: '',
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    customCss: ''
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // General Loading & Error State
  const [loadingData, setLoadingData] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const API_URL = '/api';

  // Fetch initial data
  const fetchData = async () => {
    setLoadingData(true);
    setActionError(null);
    try {
      // Fetch Invoices
      const invRes = await fetch(`${API_URL}/invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const invData = await invRes.json();
      if (invData.status === 'success') {
        setInvoices(invData.data);
      }

      // Fetch Templates
      const tempRes = await fetch(`${API_URL}/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const tempData = await tempRes.json();
      if (tempData.status === 'success') {
        setTemplates(tempData.data);
        if (tempData.data.length > 0) {
          setSelectedTemplateId(tempData.data[0]._id);
        }
      }
    } catch (err) {
      setActionError('Error loading dashboard data. Make sure backend is running.');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Handle File Drop/Select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/invoices/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (result.status === 'success') {
        setInvoices([result.data, ...invoices]);
        setSelectedInvoice(result.data);
        setEditedFields(result.data);
        setIsEditingInvoice(true);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setUploadError(result.message || 'Upload failed');
      }
    } catch (err) {
      setUploadError('Failed to connect to the server');
    } finally {
      setUploading(false);
    }
  };

  // Handle OCR Fields Modification
  const handleFieldChange = (field: keyof Invoice, value: any) => {
    setEditedFields({
      ...editedFields,
      [field]: value === '' ? null : value
    });
  };

  const handleSaveInvoiceFields = async () => {
    if (!selectedInvoice) return;
    setActionError(null);

    try {
      const response = await fetch(`${API_URL}/invoices/${selectedInvoice._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          passengerName: editedFields.passengerName,
          pnr: editedFields.pnr,
          airline: editedFields.airline,
          flightNumber: editedFields.flightNumber,
          departure: editedFields.departure,
          destination: editedFields.destination,
          travelDate: editedFields.travelDate,
          amount: editedFields.amount ? parseFloat(editedFields.amount as any) : null,
          currency: editedFields.currency,
          templateId: selectedTemplateId || null
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        setSelectedInvoice(result.data);
        setInvoices(invoices.map(inv => inv._id === result.data._id ? result.data : inv));
        setIsEditingInvoice(false);
      } else {
        setActionError(result.message || 'Error updating invoice');
      }
    } catch (err) {
      setActionError('Network error updating fields');
    }
  };

  // Trigger PDF Generation via Puppeteer
  const handleGeneratePdf = async () => {
    if (!selectedInvoice) return;
    if (!selectedTemplateId) {
      setActionError('Please select a template first');
      return;
    }

    setGeneratingPdf(true);
    setActionError(null);

    try {
      const response = await fetch(`${API_URL}/invoices/${selectedInvoice._id}/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ templateId: selectedTemplateId })
      });

      const result = await response.json();

      if (result.status === 'success') {
        setSelectedInvoice(result.data);
        setInvoices(invoices.map(inv => inv._id === result.data._id ? result.data : inv));
      } else {
        setActionError(result.message || 'Error generating branded PDF');
      }
    } catch (err) {
      setActionError('Network error initiating PDF printing');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Download Generated PDF
  const handleDownloadPdf = () => {
    if (!selectedInvoice || !selectedInvoice.pdfPath) return;
    window.open(`${API_URL}/invoices/${selectedInvoice._id}/download-pdf?token=${token}`, '_blank');
  };

  // Handle Template Actions (Create/Edit/Delete)
  const handleTemplateFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const isEdit = editingTemplateId !== null;
    const url = isEdit ? `${API_URL}/templates/${editingTemplateId}` : `${API_URL}/templates`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(templateForm)
      });

      const result = await response.json();

      if (result.status === 'success') {
        if (isEdit) {
          setTemplates(templates.map(t => t._id === result.data._id ? result.data : t));
        } else {
          setTemplates([result.data, ...templates]);
          if (!selectedTemplateId) setSelectedTemplateId(result.data._id);
        }
        setIsCreatingTemplate(false);
        setIsEditingTemplate(false);
        setEditingTemplateId(null);
        resetTemplateForm();
      } else {
        setActionError(result.message || 'Error saving template');
      }
    } catch (err) {
      setActionError('Network error saving template');
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    setActionError(null);

    try {
      const response = await fetch(`${API_URL}/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const result = await response.json();

      if (result.status === 'success') {
        setTemplates(templates.filter(t => t._id !== id));
        if (selectedTemplateId === id) {
          setSelectedTemplateId(templates.length > 1 ? templates.find(t => t._id !== id)?._id || '' : '');
        }
      } else {
        setActionError(result.message || 'Failed to delete template');
      }
    } catch (err) {
      setActionError('Error deleting template');
    }
  };

  const handleEditTemplateClick = (template: Template, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTemplateId(template._id);
    setTemplateForm({
      name: template.name,
      primaryColor: template.primaryColor,
      secondaryColor: template.secondaryColor,
      logoUrl: template.logoUrl || '',
      companyName: template.companyName,
      companyAddress: template.companyAddress,
      companyPhone: template.companyPhone,
      companyEmail: template.companyEmail,
      customCss: template.customCss || ''
    });
    setIsEditingTemplate(true);
    setIsCreatingTemplate(false);
  };

  const handleDeleteInvoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this invoice?')) return;
    setActionError(null);

    try {
      await fetch(`${API_URL}/invoices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoices(invoices.filter(i => i._id !== id));
      if (selectedInvoice?._id === id) {
        setSelectedInvoice(null);
        setIsEditingInvoice(false);
      }
    } catch (err) {
      setActionError('Error deleting invoice');
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      primaryColor: '#1e3a8a',
      secondaryColor: '#3b82f6',
      logoUrl: '',
      companyName: '',
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
      customCss: ''
    });
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center shadow-md shadow-indigo-500/10">
            <Plane className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-lg text-white">Travel PDF Automation</span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-400 font-semibold px-2 py-0.5 rounded-full ml-2 uppercase tracking-wide">SaaS</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-200">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-sm font-medium cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-16 md:w-64 border-r border-slate-800 bg-[#0c1222] p-4 flex flex-col justify-between">
          <div className="space-y-2">
            <button
              onClick={() => {
                setActiveTab('invoices');
                setSelectedInvoice(null);
                setIsEditingInvoice(false);
                setIsCreatingTemplate(false);
                setIsEditingTemplate(false);
              }}
              className={`w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer ${
                activeTab === 'invoices' 
                  ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 font-semibold' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
              }`}
            >
              <FileText className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">Invoices & OCR</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('templates');
                setIsCreatingTemplate(false);
                setIsEditingTemplate(false);
              }}
              className={`w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer ${
                activeTab === 'templates' 
                  ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 font-semibold' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Layout className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">Agency Branding</span>
            </button>
          </div>

          <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl hidden md:block text-slate-500 text-xs leading-relaxed">
            <div className="font-semibold text-slate-400 mb-1">Architecture Rules:</div>
            • MVC Layers Enabled<br />
            • Scope-locked DB isolation<br />
            • Security Multer Guard (10MB)<br />
            • PDF prints on Puppeteer A4
          </div>
        </aside>

        {/* Workspace panel */}
        <main className="flex-1 overflow-y-auto p-6">
          {actionError && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6 max-w-4xl">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div className="text-sm font-medium">{actionError}</div>
            </div>
          )}

          {loadingData ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
              <span className="text-slate-400 font-medium">Fetching secure records...</span>
            </div>
          ) : (
            <>
              {/* Tab 1: INVOICES & OCR FLOW */}
              {activeTab === 'invoices' && (
                <div className="space-y-6">
                  {/* Dashboard top row */}
                  {!selectedInvoice && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                      {/* Left: Uploader Panel */}
                      <div className="lg:col-span-1 bg-[#0f172a] border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                          <Upload className="h-5 w-5 text-indigo-400" />
                          Upload Invoice / Ticket
                        </h3>
                        
                        <form onSubmit={handleUploadSubmit} className="space-y-4">
                          <div 
                            className="border-2 border-dashed border-slate-800 hover:border-indigo-500/40 rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-slate-950/60 hover:bg-slate-950 transition-all cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <div className="h-12 w-12 rounded-xl bg-indigo-500/5 text-indigo-400 flex items-center justify-center border border-indigo-500/10">
                              <FileText className="h-6 w-6" />
                            </div>
                            <div className="text-center">
                              <span className="text-sm text-indigo-400 font-semibold hover:underline">Choose file</span>
                              <p className="text-[11px] text-slate-500 mt-1">PDF, PNG, JPG up to 10MB</p>
                            </div>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              className="hidden"
                              accept=".pdf,.png,.jpg,.jpeg"
                            />
                          </div>

                          {file && (
                            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                              <div className="truncate text-xs font-semibold text-indigo-400 max-w-[200px]">{file.name}</div>
                              <div className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                            </div>
                          )}

                          {uploadError && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                              {uploadError}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={!file || uploading}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                          >
                            {uploading ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>Extracting OCR Data...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4" />
                                <span>Process Ticket</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>

                      {/* Right: Invoices List */}
                      <div className="lg:col-span-2 bg-[#0f172a] border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Invoice Processing Queue</h3>
                        {invoices.length === 0 ? (
                          <div className="h-48 border border-dashed border-slate-850 rounded-xl flex flex-col items-center justify-center text-slate-500 text-sm">
                            No tickets uploaded yet. Upload a ticket to get started.
                          </div>
                        ) : (
                          <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-950/40">
                            <table className="w-full border-collapse text-left">
                              <thead>
                                <tr className="bg-slate-900/60 text-slate-400 font-semibold text-xs border-b border-slate-800 uppercase tracking-wider">
                                  <th className="py-3 px-4">Passenger / Airline</th>
                                  <th className="py-3 px-4">PNR</th>
                                  <th className="py-3 px-4">Total Amount</th>
                                  <th className="py-3 px-4">PDF Status</th>
                                  <th className="py-3 px-4 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800 text-sm">
                                {invoices.map((inv) => (
                                  <tr 
                                    key={inv._id}
                                    onClick={() => {
                                      setSelectedInvoice(inv);
                                      setEditedFields(inv);
                                      setIsEditingInvoice(false);
                                    }}
                                    className="hover:bg-slate-900/40 transition-all cursor-pointer"
                                  >
                                    <td className="py-3.5 px-4">
                                      <div className="font-semibold text-white truncate max-w-[180px]">{inv.passengerName || 'Processing Failed'}</div>
                                      <div className="text-xs text-slate-500">{inv.airline || 'N/A'} {inv.flightNumber}</div>
                                    </td>
                                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-400">{inv.pnr || 'N/A'}</td>
                                    <td className="py-3.5 px-4 text-slate-200">
                                      {inv.amount !== null ? `${inv.currency || 'USD'} ${inv.amount}` : 'N/A'}
                                    </td>
                                    <td className="py-3.5 px-4">
                                      {inv.pdfPath ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                          Ready
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                          Draft Mapped
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                                      <div className="flex justify-end items-center gap-2">
                                        <button
                                          onClick={() => {
                                            setSelectedInvoice(inv);
                                            setEditedFields(inv);
                                            setIsEditingInvoice(true);
                                          }}
                                          className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-white cursor-pointer"
                                          title="Edit Mapping"
                                        >
                                          <Edit3 className="h-4.5 w-4.5" />
                                        </button>
                                        <button
                                          onClick={(e) => handleDeleteInvoice(inv._id, e)}
                                          className="p-2 rounded bg-slate-850 hover:bg-red-500/20 text-slate-500 hover:text-red-400 cursor-pointer"
                                          title="Delete"
                                        >
                                          <Trash2 className="h-4.5 w-4.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Active Invoice Details / Editor View */}
                  {selectedInvoice && (
                    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-6xl">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                        <button
                          onClick={() => {
                            setSelectedInvoice(null);
                            setIsEditingInvoice(false);
                          }}
                          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          &larr; Back to queue
                        </button>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setIsEditingInvoice(!isEditingInvoice)}
                            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>{isEditingInvoice ? 'View Details' : 'Manual Map'}</span>
                          </button>
                          
                          <button
                            onClick={(e) => handleDeleteInvoice(selectedInvoice._id, e)}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Split Editor / Preview view */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* LEFT: Field Mapping Editor */}
                        <div className="lg:col-span-5 space-y-6">
                          <h4 className="font-bold text-white text-md border-b border-slate-800 pb-2 flex items-center justify-between">
                            <span>Field Mapping Editor</span>
                            <span className="text-[10px] text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-full font-semibold border border-indigo-500/20">OCR MATCH</span>
                          </h4>

                          {isEditingInvoice ? (
                            <div className="space-y-4">
                              <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Passenger Name</label>
                                <input
                                  type="text"
                                  value={editedFields.passengerName || ''}
                                  onChange={e => handleFieldChange('passengerName', e.target.value)}
                                  className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">PNR / Ref</label>
                                  <input
                                    type="text"
                                    value={editedFields.pnr || ''}
                                    onChange={e => handleFieldChange('pnr', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 uppercase font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Airline</label>
                                  <input
                                    type="text"
                                    value={editedFields.airline || ''}
                                    onChange={e => handleFieldChange('airline', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Flight Number</label>
                                  <input
                                    type="text"
                                    value={editedFields.flightNumber || ''}
                                    onChange={e => handleFieldChange('flightNumber', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Travel Date</label>
                                  <input
                                    type="text"
                                    value={editedFields.travelDate || ''}
                                    onChange={e => handleFieldChange('travelDate', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Departure</label>
                                  <input
                                    type="text"
                                    value={editedFields.departure || ''}
                                    onChange={e => handleFieldChange('departure', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Destination</label>
                                  <input
                                    type="text"
                                    value={editedFields.destination || ''}
                                    onChange={e => handleFieldChange('destination', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount</label>
                                  <input
                                    type="number"
                                    step="any"
                                    value={editedFields.amount || ''}
                                    onChange={e => handleFieldChange('amount', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Currency</label>
                                  <input
                                    type="text"
                                    value={editedFields.currency || ''}
                                    onChange={e => handleFieldChange('currency', e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 font-bold"
                                  />
                                </div>
                              </div>

                              <button
                                onClick={handleSaveInvoiceFields}
                                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Save className="h-4 w-4" />
                                <span>Save Changes</span>
                              </button>
                            </div>
                          ) : (
                            // Read-only Details View
                            <div className="space-y-4 bg-slate-950/40 p-4 border border-slate-850 rounded-xl text-sm">
                              <div>
                                <span className="text-xs text-slate-500 font-semibold block uppercase">Passenger Name</span>
                                <span className="text-white font-medium text-md">{selectedInvoice.passengerName || 'N/A'}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-xs text-slate-500 font-semibold block uppercase">PNR / Ref</span>
                                  <span className="text-indigo-400 font-mono font-bold text-md">{selectedInvoice.pnr || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-slate-500 font-semibold block uppercase">Airline</span>
                                  <span className="text-white font-medium">{selectedInvoice.airline || 'N/A'}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-xs text-slate-500 font-semibold block uppercase">Flight No</span>
                                  <span className="text-white font-medium">{selectedInvoice.flightNumber || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-slate-500 font-semibold block uppercase">Date</span>
                                  <span className="text-white font-medium">{selectedInvoice.travelDate || 'N/A'}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-xs text-slate-500 font-semibold block uppercase">Depart</span>
                                  <span className="text-white font-medium truncate block">{selectedInvoice.departure || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-slate-500 font-semibold block uppercase">Arrive</span>
                                  <span className="text-white font-medium truncate block">{selectedInvoice.destination || 'N/A'}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500 font-semibold block uppercase">Total Fare</span>
                                <span className="text-emerald-400 font-bold text-md">
                                  {selectedInvoice.amount !== null ? `${selectedInvoice.currency || 'USD'} ${selectedInvoice.amount}` : 'N/A'}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Raw OCR Text Log */}
                          <div className="space-y-2">
                            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Raw Ticket Text Log (From Tesseract)</span>
                            <div className="w-full max-h-48 overflow-y-auto p-3 rounded-lg bg-slate-950 border border-slate-850 font-mono text-[10px] text-slate-500 leading-normal whitespace-pre-wrap select-all">
                              {selectedInvoice.rawOcrText || 'No OCR log text found.'}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT: Branded Agency Print PDF Preview */}
                        <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-l border-slate-800 lg:pl-8 space-y-6">
                          <h4 className="font-bold text-white text-md border-b border-slate-800 pb-2 flex items-center justify-between">
                            <span>Branded Agency PDF Printer</span>
                            {selectedInvoice.pdfPath && (
                              <span className="text-[10px] text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-full font-semibold border border-emerald-500/20 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> PRINTED
                              </span>
                            )}
                          </h4>

                          <div className="space-y-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Branding Template</label>
                              {templates.length === 0 ? (
                                <div className="p-3 bg-amber-500/15 border border-amber-500/20 rounded-lg text-amber-400 text-xs flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4" />
                                  <span>No template available. Create a template in the "Agency Branding" tab first.</span>
                                </div>
                              ) : (
                                <select
                                  value={selectedTemplateId}
                                  onChange={e => setSelectedTemplateId(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:border-indigo-500 outline-none font-medium cursor-pointer"
                                >
                                  {templates.map(t => (
                                    <option key={t._id} value={t._id}>{t.name} ({t.companyName})</option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4">
                              <button
                                onClick={handleGeneratePdf}
                                disabled={generatingPdf || templates.length === 0}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                              >
                                {generatingPdf ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    <span>Rendering Puppeteer PDF...</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4" />
                                    <span>{selectedInvoice.pdfPath ? 'Regenerate Branded PDF' : 'Render Branded PDF'}</span>
                                  </>
                                )}
                              </button>

                              {selectedInvoice.pdfPath && (
                                <button
                                  onClick={handleDownloadPdf}
                                  className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
                                >
                                  <Download className="h-4 w-4" />
                                  <span>Download PDF</span>
                                </button>
                              )}
                            </div>

                            {/* Rendered Iframe Sandbox */}
                            {selectedInvoice.pdfPath ? (
                              <div className="border border-slate-800 rounded-xl overflow-hidden bg-white h-[450px] relative">
                                <iframe
                                  src={`${API_URL}/invoices/${selectedInvoice._id}/download-pdf?token=${token}#toolbar=0`}
                                  className="w-full h-full p-8"
                                  title="PDF Preview"
                                ></iframe>
                              </div>
                            ) : (
                              <div className="h-[450px] border border-dashed border-slate-850 rounded-xl flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                                <FileText className="h-12 w-12 text-slate-600 mb-1" />
                                <span>Branded PDF has not been printed yet.</span>
                                <span className="text-xs text-slate-600">Select a template above and click "Render Branded PDF"</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: TEMPLATES MANAGEMENT */}
              {activeTab === 'templates' && (
                <div className="space-y-6 max-w-5xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">Agency Branding Designer</h3>
                      <p className="text-xs text-slate-400 mt-1">Configure company details, logo, colors, and print CSS to apply to invoices</p>
                    </div>

                    {!isCreatingTemplate && !isEditingTemplate && (
                      <button
                        onClick={() => {
                          resetTemplateForm();
                          setIsCreatingTemplate(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center gap-1 cursor-pointer transition-all shadow-md shadow-indigo-500/10"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Create Brand Theme</span>
                      </button>
                    )}
                  </div>

                  {/* Form Create/Edit */}
                  {(isCreatingTemplate || isEditingTemplate) && (
                    <form onSubmit={handleTemplateFormSubmit} className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 space-y-6">
                      <h4 className="font-bold text-white text-md border-b border-slate-850 pb-2">
                        {isEditingTemplate ? `Edit Brand: ${templateForm.name}` : 'New Brand Template'}
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Template Theme Name</label>
                            <input
                              type="text"
                              required
                              value={templateForm.name}
                              onChange={e => setTemplateForm({...templateForm, name: e.target.value})}
                              placeholder="e.g. Classic Premium, Emerald Business"
                              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Primary Color (Hex)</label>
                              <div className="flex gap-2">
                                <input
                                  type="color"
                                  value={templateForm.primaryColor}
                                  onChange={e => setTemplateForm({...templateForm, primaryColor: e.target.value})}
                                  className="h-9 w-9 rounded border border-slate-800 bg-transparent p-0.5 cursor-pointer"
                                />
                                <input
                                  type="text"
                                  required
                                  value={templateForm.primaryColor}
                                  onChange={e => setTemplateForm({...templateForm, primaryColor: e.target.value})}
                                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Secondary Color (Hex)</label>
                              <div className="flex gap-2">
                                <input
                                  type="color"
                                  value={templateForm.secondaryColor}
                                  onChange={e => setTemplateForm({...templateForm, secondaryColor: e.target.value})}
                                  className="h-9 w-9 rounded border border-slate-800 bg-transparent p-0.5 cursor-pointer"
                                />
                                <input
                                  type="text"
                                  required
                                  value={templateForm.secondaryColor}
                                  onChange={e => setTemplateForm({...templateForm, secondaryColor: e.target.value})}
                                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 text-sm"
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Logo URL (Optional)</label>
                            <input
                              type="text"
                              value={templateForm.logoUrl}
                              onChange={e => setTemplateForm({...templateForm, logoUrl: e.target.value})}
                              placeholder="https://example.com/logo.png"
                              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Agency Company Name</label>
                            <input
                              type="text"
                              required
                              value={templateForm.companyName}
                              onChange={e => setTemplateForm({...templateForm, companyName: e.target.value})}
                              placeholder="e.g. Skyline Travel Agency"
                              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Company Address</label>
                            <input
                              type="text"
                              required
                              value={templateForm.companyAddress}
                              onChange={e => setTemplateForm({...templateForm, companyAddress: e.target.value})}
                              placeholder="123 Travel Way, Paris, France"
                              className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 text-sm"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Company Phone</label>
                              <input
                                type="text"
                                required
                                value={templateForm.companyPhone}
                                onChange={e => setTemplateForm({...templateForm, companyPhone: e.target.value})}
                                placeholder="+33 1 2345 6789"
                                className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Company Email</label>
                              <input
                                type="email"
                                required
                                value={templateForm.companyEmail}
                                onChange={e => setTemplateForm({...templateForm, companyEmail: e.target.value})}
                                placeholder="billing@skylinetravel.com"
                                className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Custom CSS Tweaks (Optional)</label>
                        <textarea
                          rows={3}
                          value={templateForm.customCss}
                          onChange={e => setTemplateForm({...templateForm, customCss: e.target.value})}
                          placeholder=".invoice-title { font-family: Georgia; } .items-table th { background: radial-gradient(...); }"
                          className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none text-slate-200 font-mono text-xs leading-normal"
                        />
                      </div>

                      <div className="flex gap-4">
                        <button
                          type="submit"
                          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer text-sm"
                        >
                          Save Brand Template
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingTemplate(false);
                            setIsEditingTemplate(false);
                            setEditingTemplateId(null);
                            resetTemplateForm();
                          }}
                          className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* List Templates Grid */}
                  {!isCreatingTemplate && !isEditingTemplate && (
                    <>
                      {templates.length === 0 ? (
                        <div className="h-48 border border-dashed border-slate-850 rounded-xl flex flex-col items-center justify-center text-slate-500 text-sm">
                          No agency templates registered. Create one to enable branded PDF exports.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {templates.map(t => (
                            <div 
                              key={t._id}
                              className={`p-5 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col justify-between hover:border-indigo-500/40 transition-all group ${
                                selectedTemplateId === t._id ? 'ring-1 ring-indigo-500/50 border-indigo-500/30' : ''
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-4">
                                  <span className="font-bold text-white text-md group-hover:text-indigo-400 transition-colors">{t.name}</span>
                                  {selectedTemplateId === t._id && (
                                    <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                      Default Active
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-2 text-xs text-slate-400 mb-6">
                                  <div><strong className="text-slate-300">Company:</strong> {t.companyName}</div>
                                  <div><strong className="text-slate-300">Address:</strong> {t.companyAddress}</div>
                                  <div><strong className="text-slate-300">Phone:</strong> {t.companyPhone}</div>
                                  <div><strong className="text-slate-300">Email:</strong> {t.companyEmail}</div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-t border-slate-850 pt-4">
                                <div className="flex gap-2">
                                  <div 
                                    className="h-6 w-6 rounded-full border border-slate-800" 
                                    style={{ backgroundColor: t.primaryColor }}
                                    title={`Primary Color: ${t.primaryColor}`}
                                  ></div>
                                  <div 
                                    className="h-6 w-6 rounded-full border border-slate-800" 
                                    style={{ backgroundColor: t.secondaryColor }}
                                    title={`Secondary Color: ${t.secondaryColor}`}
                                  ></div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => handleEditTemplateClick(t, e)}
                                    className="p-2 rounded bg-slate-850 hover:bg-slate-800 text-indigo-400 hover:text-white cursor-pointer"
                                    title="Edit"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteTemplate(t._id, e)}
                                    className="p-2 rounded bg-slate-850 hover:bg-red-500/20 text-slate-500 hover:text-red-400 cursor-pointer"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
