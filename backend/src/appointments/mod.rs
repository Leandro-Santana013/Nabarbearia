//! Complete appointment commands. Each command owns one immediate transaction.
//! Transport authenticates and validates syntax; this module enforces business permissions.
mod error;
pub(crate) mod storage;
pub use error::{Error, Rejection};

use chrono::{DateTime, Utc};

pub struct Idempotency {
    pub key: String,
    pub request_hash: String,
}
pub struct Booking {
    pub barber_id: String,
    pub service_id: String,
    pub starts_at: DateTime<Utc>,
    pub idempotency: Idempotency,
}
pub struct ReceptionBooking {
    pub booking: Booking,
    pub client_id: String,
    pub client_name: Option<String>,
    pub client_phone: String,
    pub payment_method: Option<String>,
    pub client_note: String,
}

fn require_future(starts_at: DateTime<Utc>) -> Result<(), Error> {
    if starts_at <= Utc::now() {
        return Err(Error::bad_request(
            "INVALID_APPOINTMENT",
            "Appointment must be in the future",
        ));
    }
    Ok(())
}

mod bulk;
mod creation;
mod transitions;
pub use bulk::{AgendaChange, BatchAction, change_agenda};
pub use creation::{create, create_reception};
pub use transitions::{Details, cancel, complete, no_show, reschedule, start, update_details};

#[cfg(test)]
mod tests;
