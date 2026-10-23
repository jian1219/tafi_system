import { useEffect, useState } from 'react'
import { Download, Eye, FileText, Trash2, Upload, X } from 'lucide-react'
import {
	deleteTafiAdminEmployeeDocument,
	getBranchEmployeeDocument,
	getGuestEmployeeDocument,
	getTafiAdminEmployeeDocument,
	listBranchEmployeeDocuments,
	listGuestEmployeeDocuments,
	listTafiAdminEmployeeDocuments,
	uploadBranchEmployeeDocument,
	uploadTafiAdminEmployeeDocument
} from '../../lib/supabase'

const maxFileSize = 20 * 1024 * 1024
const acceptedContentTypes = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/jpeg',
	'image/png',
	'image/webp'
])
const acceptedFileTypes = [
	'.pdf',
	'.doc',
	'.docx',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/jpeg',
	'image/png',
	'image/webp'
].join(',')

const documentCategories = [
	{ id: 'incident_report', label: 'Incident Report' },
	{ id: 'investigation_report', label: 'Investigation Report' },
	{ id: 'employee_contract', label: 'Employee Contract Records' },
	{ id: 'employee_evaluation', label: 'Employee Evaluation Records' }
]

function readFileAsBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result !== 'string') {
				reject(new Error('Unable to read the selected file.'))
				return
			}
			const separatorIndex = reader.result.indexOf(',')
			if (separatorIndex < 0) {
				reject(new Error('Unable to read the selected file.'))
				return
			}
			resolve(reader.result.slice(separatorIndex + 1))
		}
		reader.onerror = () => reject(reader.error ?? new Error('Unable to read the selected file.'))
		reader.onabort = () => reject(new Error('Reading the selected file was cancelled.'))
		reader.readAsDataURL(file)
	})
}

function formatFileSize(size) {
	if (size < 1024) return `${size} B`
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
	return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(value) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return 'Date unavailable'
	return new Intl.DateTimeFormat('en-PH', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}).format(date)
}

function createDocumentBlob(file) {
	const binary = window.atob(file.file_base64)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}
	return new Blob([bytes], { type: file.content_type })
}

export default function TafiEmployeeDocuments({
	sessionToken,
	employeeId,
	branchEmployeeCode = '',
	readOnly = false
}) {
	const isBranchAdmin = Boolean(branchEmployeeCode)
	const [documents, setDocuments] = useState([])
	const [selectedCategory, setSelectedCategory] = useState(documentCategories[0].id)
	const [selectedFile, setSelectedFile] = useState(null)
	const [previewDocument, setPreviewDocument] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isUploading, setIsUploading] = useState(false)
	const [downloadingId, setDownloadingId] = useState('')
	const [viewingId, setViewingId] = useState('')
	const [recordToDelete, setRecordToDelete] = useState(null)
	const [isDeleting, setIsDeleting] = useState(false)
	const [loadError, setLoadError] = useState('')
	const [uploadError, setUploadError] = useState('')
	const [downloadError, setDownloadError] = useState('')
	const [deleteError, setDeleteError] = useState('')
	const [deleteMessage, setDeleteMessage] = useState('')
	const [uploadMessage, setUploadMessage] = useState('')

	useEffect(() => {
		if (!previewDocument) return undefined
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') setPreviewDocument(null)
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [previewDocument])

	useEffect(() => {
		if (!recordToDelete || isDeleting) return undefined
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') setRecordToDelete(null)
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [recordToDelete, isDeleting])

	useEffect(() => () => {
		if (previewDocument?.url) URL.revokeObjectURL(previewDocument.url)
	}, [previewDocument])

	useEffect(() => {
		let isCurrent = true

		const loadDocuments = async () => {
			setIsLoading(true)
			setLoadError('')
			const { data, error } = isBranchAdmin
				? await listBranchEmployeeDocuments(sessionToken, branchEmployeeCode)
				: readOnly
					? await listGuestEmployeeDocuments(sessionToken, employeeId)
					: await listTafiAdminEmployeeDocuments(sessionToken, employeeId)
			if (!isCurrent) return

			if (error) {
				setDocuments([])
				setLoadError(error.message)
			} else {
				setDocuments(data ?? [])
			}
			setIsLoading(false)
		}

		loadDocuments()
		return () => {
			isCurrent = false
		}
	}, [sessionToken, employeeId, branchEmployeeCode, isBranchAdmin, readOnly])

	const handleUpload = async (event) => {
		event.preventDefault()
		setUploadError('')
		setUploadMessage('')

		if (!selectedFile) {
			setUploadError('Choose a file to upload.')
			return
		}
		if (!acceptedContentTypes.has(selectedFile.type)) {
			setUploadError('Upload a PDF, Word document, JPEG, PNG, or WebP image.')
			return
		}
		if (selectedFile.size === 0 || selectedFile.size > maxFileSize) {
			setUploadError('Choose a file larger than 0 bytes and no larger than 20 MB.')
			return
		}

		setIsUploading(true)
		let fileBase64
		try {
			fileBase64 = await readFileAsBase64(selectedFile)
		} catch (error) {
			setUploadError(error instanceof Error ? error.message : 'Unable to read the selected file.')
			setIsUploading(false)
			return
		}

		const uploadDocument = isBranchAdmin
			? uploadBranchEmployeeDocument(
				sessionToken,
				branchEmployeeCode,
				selectedCategory,
				selectedFile.name,
				selectedFile.type,
				fileBase64
			)
			: uploadTafiAdminEmployeeDocument(
				sessionToken,
				employeeId,
				selectedCategory,
				selectedFile.name,
				selectedFile.type,
				fileBase64
			)
		const { error } = await uploadDocument
		if (error) {
			setUploadError(error.message)
			setIsUploading(false)
			return
		}

		setSelectedFile(null)
		const { data, error: refreshError } = isBranchAdmin
			? await listBranchEmployeeDocuments(sessionToken, branchEmployeeCode)
			: await listTafiAdminEmployeeDocuments(sessionToken, employeeId)
		setIsUploading(false)
		if (refreshError) {
			setUploadError(`The file was uploaded, but the document list could not be refreshed: ${refreshError.message}`)
			return
		}

		setDocuments(data ?? [])
		setUploadMessage('File uploaded successfully.')
	}

	const handleView = async (record) => {
		setDownloadError('')
		setViewingId(record.document_id)
		const { data, error } = readOnly
			? await getGuestEmployeeDocument(sessionToken, record.document_id)
			: isBranchAdmin
				? await getBranchEmployeeDocument(sessionToken, record.document_id)
				: await getTafiAdminEmployeeDocument(sessionToken, record.document_id)
		setViewingId('')
		if (error) {
			setDownloadError(error.message)
			return
		}

		const file = data?.[0]
		if (!file) {
			setDownloadError('The selected employee document was not returned.')
			return
		}

		try {
			const fileUrl = URL.createObjectURL(createDocumentBlob(file))
			setPreviewDocument({
				documentId: record.document_id,
				fileName: file.file_name,
				contentType: file.content_type,
				url: fileUrl
			})
		} catch (error) {
			setDownloadError(error instanceof Error ? error.message : 'Unable to prepare the employee document preview.')
		}
	}

	const handleDownload = async (record) => {
		setDownloadError('')
		setDownloadingId(record.document_id)
		const { data, error } = readOnly
			? await getGuestEmployeeDocument(sessionToken, record.document_id)
			: isBranchAdmin
				? await getBranchEmployeeDocument(sessionToken, record.document_id)
				: await getTafiAdminEmployeeDocument(sessionToken, record.document_id)
		setDownloadingId('')
		if (error) {
			setDownloadError(error.message)
			return
		}

		const file = data?.[0]
		if (!file) {
			setDownloadError('The selected employee document was not returned.')
			return
		}

		try {
			const fileUrl = URL.createObjectURL(createDocumentBlob(file))
			const link = document.createElement('a')
			link.href = fileUrl
			link.download = file.file_name
			document.body.appendChild(link)
			link.click()
			link.remove()
			window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
		} catch (error) {
			setDownloadError(error instanceof Error ? error.message : 'Unable to prepare the employee document download.')
		}
	}

	const handleDelete = async () => {
		if (!recordToDelete || readOnly || isBranchAdmin || isDeleting) return

		const selectedRecord = recordToDelete
		setIsDeleting(true)
		setDeleteError('')
		setDeleteMessage('')

		const { data, error } = await deleteTafiAdminEmployeeDocument(
			sessionToken,
			selectedRecord.document_id
		)
		setIsDeleting(false)
		if (error) {
			setDeleteError(error.message)
			return
		}
		if (data !== true) {
			setDeleteError('The employee record was not deleted.')
			return
		}

		setDocuments((current) => current.filter(
			(record) => record.document_id !== selectedRecord.document_id
		))
		if (previewDocument?.documentId === selectedRecord.document_id) {
			setPreviewDocument(null)
		}
		setRecordToDelete(null)
		setDeleteMessage(`${selectedRecord.file_name} was deleted.`)
	}

	return (
		<section className="employee-detail-panel employee-personal-details employee-document-records">
			<div className="employee-detail-panel-heading">
				<div>
					<h4>Employee Records</h4>
					<p>
						{readOnly
							? 'View or download incident, investigation, contract, and evaluation records for this employee.'
							: isBranchAdmin
								? 'Upload, view, or download incident, investigation, contract, and evaluation records for this employee.'
								: 'Upload and manage incident, investigation, contract, and evaluation records for this employee.'}
					</p>
				</div>
			</div>

			{!readOnly && (
				<form className="employee-document-upload-form" onSubmit={handleUpload}>
				<label>
					<span>Record type</span>
					<select
						value={selectedCategory}
						onChange={(event) => setSelectedCategory(event.target.value)}
						disabled={isUploading}
					>
						{documentCategories.map((category) => (
							<option key={category.id} value={category.id}>{category.label}</option>
						))}
					</select>
				</label>
				<label>
					<span>File (PDF, Word, JPEG, PNG, or WebP · max 20 MB)</span>
					<input
						type="file"
						accept={acceptedFileTypes}
						disabled={isUploading}
						onChange={(event) => {
							setSelectedFile(event.currentTarget.files?.[0] ?? null)
							setUploadError('')
							setUploadMessage('')
							event.currentTarget.value = ''
						}}
					/>
				</label>
				<button type="submit" className="add-employee-submit" disabled={isUploading || !selectedFile}>
					<Upload size={16} aria-hidden="true" />
					{isUploading ? 'Uploading…' : 'Upload file'}
				</button>
				</form>
			)}

			{!readOnly && selectedFile && (
				<p className="employee-document-selected-file">
					Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
				</p>
			)}
			{!readOnly && uploadError && <p className="employee-document-message error" role="alert">{uploadError}</p>}
			{!readOnly && uploadMessage && <p className="employee-document-message success" role="status">{uploadMessage}</p>}
			{!readOnly && deleteMessage && <p className="employee-document-message success" role="status">{deleteMessage}</p>}
			{downloadError && <p className="employee-document-message error" role="alert">{downloadError}</p>}
			{loadError && <p className="employee-document-message error" role="alert">Could not load employee records: {loadError}</p>}
			{isLoading ? (
				<p className="employee-detail-empty" role="status">Loading employee records…</p>
			) : !loadError ? (
				<div className="employee-document-category-list">
					{documentCategories.map((category) => {
						const categoryDocuments = documents.filter((record) => record.document_type === category.id)
						return (
							<section className="employee-document-category" key={category.id}>
								<h5>{category.label}</h5>
								{categoryDocuments.length ? (
									<ul className="employee-document-list">
										{categoryDocuments.map((record) => (
											<li className="employee-document-row" key={record.document_id}>
												<div className="employee-document-info">
													<FileText size={18} aria-hidden="true" />
													<div>
														<strong>{record.file_name}</strong>
														<span>
															{formatFileSize(Number(record.file_size_bytes))}
															{' · '}
															{formatUploadedAt(record.uploaded_at)}
														</span>
													</div>
												</div>
												<div className="employee-document-actions">
													<button
														type="button"
														className="employee-document-download"
														disabled={viewingId === record.document_id || downloadingId === record.document_id}
														onClick={() => handleView(record)}
													>
														<Eye size={16} aria-hidden="true" />
														{viewingId === record.document_id ? 'Loading…' : 'View'}
													</button>
													<button
														type="button"
														className="employee-document-download"
														disabled={viewingId === record.document_id || downloadingId === record.document_id}
														onClick={() => handleDownload(record)}
													>
														<Download size={16} aria-hidden="true" />
														{downloadingId === record.document_id ? 'Preparing…' : 'Download'}
													</button>
													{!readOnly && !isBranchAdmin && (
														<button
															type="button"
															className="employee-document-delete"
															disabled={isDeleting || viewingId === record.document_id || downloadingId === record.document_id}
															aria-label={`Delete ${record.file_name}`}
															onClick={() => {
																setRecordToDelete(record)
																setDeleteError('')
																setDeleteMessage('')
															}}
														>
															<Trash2 size={16} aria-hidden="true" />
															Delete
														</button>
													)}
												</div>
											</li>
										))}
									</ul>
								) : (
									<p className="employee-detail-empty">No files have been added.</p>
								)}
							</section>
						)
					})}
				</div>
			) : null}
			{previewDocument && (
				<div
					className="employee-document-preview-backdrop"
					role="presentation"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setPreviewDocument(null)
					}}
				>
					<section
						className="employee-document-preview"
						role="dialog"
						aria-modal="true"
						aria-labelledby="employee-document-preview-title"
					>
						<header className="employee-document-preview-heading">
							<h5 id="employee-document-preview-title">{previewDocument.fileName}</h5>
							<button
								type="button"
								className="employee-document-preview-close"
								aria-label="Close document preview"
								onClick={() => setPreviewDocument(null)}
							>
								<X size={20} aria-hidden="true" />
							</button>
						</header>
						<div className="employee-document-preview-content">
							{previewDocument.contentType === 'application/pdf' ? (
								<iframe src={previewDocument.url} title={`Preview of ${previewDocument.fileName}`} />
							) : previewDocument.contentType.startsWith('image/') ? (
								<img src={previewDocument.url} alt={previewDocument.fileName} />
							) : (
								<div className="employee-document-preview-unsupported">
									<p>Preview is not available for Word documents. Download the file to open it.</p>
									<button
										type="button"
										className="employee-document-download"
										disabled={downloadingId === previewDocument.documentId}
										onClick={() => handleDownload({ document_id: previewDocument.documentId })}
									>
										<Download size={16} aria-hidden="true" />
										{downloadingId === previewDocument.documentId ? 'Preparing…' : 'Download file'}
									</button>
								</div>
							)}
						</div>
						{downloadError && <p className="employee-document-message error" role="alert">{downloadError}</p>}
					</section>
				</div>
			)}
			{!readOnly && recordToDelete && (
				<div
					className="employee-document-preview-backdrop"
					role="presentation"
					onMouseDown={(event) => {
						if (!isDeleting && event.target === event.currentTarget) setRecordToDelete(null)
					}}
				>
					<section
						className="employee-document-delete-dialog"
						role="alertdialog"
						aria-modal="true"
						aria-labelledby="employee-document-delete-title"
						aria-describedby="employee-document-delete-description"
					>
						<h5 id="employee-document-delete-title">Delete employee record?</h5>
						<p id="employee-document-delete-description">
							This will permanently delete <strong>{recordToDelete.file_name}</strong> and its stored file data.
							This action cannot be undone.
						</p>
						{deleteError && <p className="employee-document-message error" role="alert">{deleteError}</p>}
						<div className="employee-document-delete-actions">
							<button
								type="button"
								className="employee-document-delete-cancel"
								disabled={isDeleting}
								onClick={() => setRecordToDelete(null)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="employee-document-delete-confirm"
								disabled={isDeleting}
								onClick={handleDelete}
							>
								<Trash2 size={16} aria-hidden="true" />
								{isDeleting ? 'Deleting…' : 'Delete file'}
							</button>
						</div>
					</section>
				</div>
			)}
		</section>
	)
}
