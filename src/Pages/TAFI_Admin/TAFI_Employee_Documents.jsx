import { useEffect, useState } from 'react'
import { Download, FileText, Upload } from 'lucide-react'
import {
	getTafiAdminEmployeeDocument,
	listTafiAdminEmployeeDocuments,
	uploadTafiAdminEmployeeDocument
} from '../../lib/supabase'

const maxFileSize = 5 * 1024 * 1024
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

export default function TafiEmployeeDocuments({ sessionToken, employeeId }) {
	const [documents, setDocuments] = useState([])
	const [selectedCategory, setSelectedCategory] = useState(documentCategories[0].id)
	const [selectedFile, setSelectedFile] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isUploading, setIsUploading] = useState(false)
	const [downloadingId, setDownloadingId] = useState('')
	const [loadError, setLoadError] = useState('')
	const [uploadError, setUploadError] = useState('')
	const [downloadError, setDownloadError] = useState('')
	const [uploadMessage, setUploadMessage] = useState('')

	useEffect(() => {
		let isCurrent = true

		const loadDocuments = async () => {
			setIsLoading(true)
			setLoadError('')
			const { data, error } = await listTafiAdminEmployeeDocuments(sessionToken, employeeId)
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
	}, [sessionToken, employeeId])

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
			setUploadError('Choose a file larger than 0 bytes and no larger than 5 MB.')
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

		const { error } = await uploadTafiAdminEmployeeDocument(
			sessionToken,
			employeeId,
			selectedCategory,
			selectedFile.name,
			selectedFile.type,
			fileBase64
		)
		if (error) {
			setUploadError(error.message)
			setIsUploading(false)
			return
		}

		setSelectedFile(null)
		const { data, error: refreshError } = await listTafiAdminEmployeeDocuments(sessionToken, employeeId)
		setIsUploading(false)
		if (refreshError) {
			setUploadError(`The file was uploaded, but the document list could not be refreshed: ${refreshError.message}`)
			return
		}

		setDocuments(data ?? [])
		setUploadMessage('File uploaded successfully.')
	}

	const handleDownload = async (record) => {
		setDownloadError('')
		setDownloadingId(record.document_id)
		const { data, error } = await getTafiAdminEmployeeDocument(sessionToken, record.document_id)
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
			const binary = window.atob(file.file_base64)
			const bytes = new Uint8Array(binary.length)
			for (let index = 0; index < binary.length; index += 1) {
				bytes[index] = binary.charCodeAt(index)
			}
			const fileUrl = URL.createObjectURL(new Blob([bytes], { type: file.content_type }))
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

	return (
		<section className="employee-detail-panel employee-personal-details employee-document-records">
			<div className="employee-detail-panel-heading">
				<div>
					<h4>Employee Records</h4>
					<p>Upload and keep incident, contract, and evaluation files for this employee.</p>
				</div>
			</div>

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
					<span>File (PDF, Word, JPEG, PNG, or WebP · max 5 MB)</span>
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

			{selectedFile && (
				<p className="employee-document-selected-file">
					Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
				</p>
			)}
			{uploadError && <p className="employee-document-message error" role="alert">{uploadError}</p>}
			{uploadMessage && <p className="employee-document-message success" role="status">{uploadMessage}</p>}
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
												<button
													type="button"
													className="employee-document-download"
													disabled={downloadingId === record.document_id}
													onClick={() => handleDownload(record)}
												>
													<Download size={16} aria-hidden="true" />
													{downloadingId === record.document_id ? 'Preparing…' : 'Download'}
												</button>
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
		</section>
	)
}
