import { UserRound } from 'lucide-react'

export default function GuestOverview({ guest }) {
	return (
		<section className="tafi-admin-section guest-overview-section" aria-labelledby="guest-overview-title">
			<div className="guest-overview-heading">
				<span className="guest-overview-icon">
					<UserRound size={23} aria-hidden="true" />
				</span>
				<div>
					<p className="guest-overview-kicker">GUEST ACCOUNT</p>
					<h2 id="guest-overview-title">Welcome, {guest.guest_name}</h2>
				</div>
			</div>
			<p className="guest-overview-intro">
				You are signed in to the TAFI Guest workspace. Your account details are shown below.
			</p>
			<dl className="guest-overview-details">
				<div>
					<dt>Name</dt>
					<dd>{guest.guest_name}</dd>
				</div>
				<div>
					<dt>Email</dt>
					<dd>{guest.guest_email}</dd>
				</div>
			</dl>
		</section>
	)
}