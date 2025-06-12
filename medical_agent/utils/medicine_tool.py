import json
import os
from typing import List, Dict, Optional, Any, Union
import datetime

# Path to database files
MEDICINE_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database", "medicines.json")

def load_medicines() -> List[Dict]:
    """
    Load the medicines from the database file.
    
    Returns:
        List[Dict]: A list of medicine dictionaries, each containing details about the medicine.
    """
    try:
        if os.path.exists(MEDICINE_DB_PATH):
            with open(MEDICINE_DB_PATH, 'r') as f:
                medicines = json.load(f)
                return medicines
        else:
            print(f"Error: Medicine database file not found at {MEDICINE_DB_PATH}")
            return []
    except Exception as e:
        print(f"Error loading medicines: {str(e)}")
        return []

def find_medicine_by_name(name: str) -> Optional[Dict]:
    """
    Get a specific medicine by its name.
    
    Args:
        name (str): The name of the medicine to retrieve.
        
    Returns:
        Optional[Dict]: The medicine details if found, None otherwise.
    """
    medicines = load_medicines()
    for medicine in medicines:
        if medicine.get('name').lower() == name.lower():
            return medicine
    return None

def get_medicine_by_name(name: str) -> Optional[Dict]:
    """
    Get a specific medicine by its name.
    
    Args:
        name (str): The name of the medicine to retrieve.
        
    Returns:
        Optional[Dict]: The medicine details if found, None otherwise.
    """
    return find_medicine_by_name(name)

def search_medicines(query: str) -> List[Dict]:
    """
    Search for medicines by name, category, or description.
    
    Args:
        query (str): The search query.
        
    Returns:
        List[Dict]: A list of matching medicines.
    """
    medicines = load_medicines()
    results = []
    query = query.lower()
    
    for medicine in medicines:
        if (query in medicine.get('name', '').lower() or 
            query in medicine.get('generic_name', '').lower() or
            query in medicine.get('category', '').lower() or
            query in medicine.get('description', '').lower()):
            results.append(medicine)
    
    return results

def get_medicines_by_category(category: str) -> List[Dict]:
    """
    Get all medicines in a specific category.
    
    Args:
        category (str): The category to filter by.
        
    Returns:
        List[Dict]: A list of medicines in the specified category.
    """
    medicines = load_medicines()
    return [med for med in medicines if med.get('category', '').lower() == category.lower()]

def add_patient_medication(patient_email: str, medication_name: str, prescription_details: str, prescribed_by: str) -> bool:
    """
    Add a medication to a patient's record.
    
    Args:
        patient_email (str): The email of the patient.
        medication_name (str): The name of the prescribed medication.
        prescription_details (str): Details about the prescription (dosage, frequency, etc.).
        prescribed_by (str): The name or email of the doctor who prescribed the medication.
        
    Returns:
        bool: True if the medication was successfully added, False otherwise.
    """
    from .database_utils import read_patient_db, write_patient_db
    
    try:
        # Get the medicine details
        medicine = get_medicine_by_name(medication_name)
        if not medicine:
            print(f"Error: Medicine with name {medication_name} not found.")
            return False
        
        # Get all patients
        patients = read_patient_db()
        patient_found = False
        
        # Find the patient and add the medication
        for i, patient in enumerate(patients):
            if patient.get('email') == patient_email:
                patient_found = True
                
                # Check if the patient already has a medications list
                if 'medications' not in patient:
                    patients[i]['medications'] = []
                
                # Add the new medication
                patients[i]['medications'].append({
                    'name': medicine.get('name'),
                    'prescription_details': prescription_details,
                    'prescribed_by': prescribed_by,
                    'date_prescribed': datetime.datetime.now().strftime("%Y-%m-%d"),
                    'category': medicine.get('category'),
                    'active': True
                })
                
                # Save the updated patient data
                if write_patient_db(patients):
                    return True
                else:
                    print("Error writing to patient database.")
                    return False
        
        if not patient_found:
            print(f"Error: Patient with email {patient_email} not found.")
            return False
        
        return False
    except Exception as e:
        print(f"Error adding medication to patient: {str(e)}")
        return False

def get_patient_medications(patient_email: str) -> List[Dict]:
    """
    Get all medications for a specific patient.
    
    Args:
        patient_email (str): The email of the patient.
        
    Returns:
        List[Dict]: A list of medications prescribed to the patient.
    """
    from .database_utils import get_patient_by_email
    
    try:
        patient = get_patient_by_email(patient_email)
        if not patient:
            print(f"Error: Patient with email {patient_email} not found.")
            return []
        
        return patient.get('medications', [])
    except Exception as e:
        print(f"Error getting patient medications: {str(e)}")
        return []

def update_patient_medication_status(patient_email: str, medication_name: str, active: bool) -> bool:
    """
    Update the status of a patient's medication (active/inactive).
    
    Args:
        patient_email (str): The email of the patient.
        medication_name (str): The name of the medication to update.
        active (bool): Whether the medication is active or not.
        
    Returns:
        bool: True if the medication status was successfully updated, False otherwise.
    """
    from .database_utils import read_patient_db, write_patient_db
    
    try:
        # Get all patients
        patients = read_patient_db()
        patient_found = False
        medication_found = False
        
        # Find the patient and update the medication status
        for i, patient in enumerate(patients):
            if patient.get('email') == patient_email:
                patient_found = True
                
                if 'medications' in patient:
                    for j, medication in enumerate(patient['medications']):
                        if medication.get('name') == medication_name:
                            medication_found = True
                            patients[i]['medications'][j]['active'] = active
                            
                            # Save the updated patient data
                            if write_patient_db(patients):
                                return True
                            else:
                                print("Error writing to patient database.")
                                return False
                
                if not medication_found:
                    print(f"Error: Medication with name {medication_name} not found for patient {patient_email}.")
                    return False
        
        if not patient_found:
            print(f"Error: Patient with email {patient_email} not found.")
            return False
        
        return False
    except Exception as e:
        print(f"Error updating medication status: {str(e)}")
        return False

def update_medicine_quantity(medicine_name: str, quantity_change: int) -> bool:
    """
    Update the quantity of a medicine in the database.
    
    Args:
        medicine_name (str): The name of the medicine to update.
        quantity_change (int): The change in quantity (negative for purchase, positive for restock).
        
    Returns:
        bool: True if the update was successful, False otherwise.
    """
    try:
        medicines = load_medicines()
        updated = False
        
        for i, medicine in enumerate(medicines):
            if medicine.get('name') == medicine_name:
                current_quantity = medicine.get('quantity', 0)
                new_quantity = current_quantity + quantity_change
                
                # Prevent negative quantity
                if new_quantity < 0:
                    print(f"Error: Cannot reduce quantity below zero for medicine {medicine_name}")
                    return False
                    
                medicines[i]['quantity'] = new_quantity
                updated = True
                break
                
        if not updated:
            print(f"Error: Medicine with name {medicine_name} not found.")
            return False
            
        # Save the updated medicines data
        try:
            with open(MEDICINE_DB_PATH, 'w') as f:
                json.dump(medicines, f, indent=2)
            return True
        except Exception as e:
            print(f"Error writing to medicine database: {str(e)}")
            return False
            
    except Exception as e:
        print(f"Error updating medicine quantity: {str(e)}")
        return False

def purchase_medicine(patient_email: str, medicine_name: str, quantity: int) -> bool:
    """
    Process a medicine purchase for a patient.
    
    Args:
        patient_email (str): The email of the patient making the purchase.
        medicine_name (str): The name of the medicine to purchase.
        quantity (int): The quantity to purchase.
        
    Returns:
        bool: True if the purchase was successful, False otherwise.
    """
    from .database_utils import read_patient_db, write_patient_db, get_patient_by_email
    
    try:
        # Check if medicine exists and has enough quantity
        medicine = find_medicine_by_name(medicine_name)
        if not medicine:
            print(f"Error: Medicine with name {medicine_name} not found.")
            return False
            
        if medicine.get('quantity', 0) < quantity:
            print(f"Error: Not enough quantity available for medicine {medicine.get('name')}.")
            return False
            
        # Update medicine quantity
        if not update_medicine_quantity(medicine_name, -quantity):
            return False
            
        # Get the patient
        patient = get_patient_by_email(patient_email)
        if not patient:
            print(f"Error: Patient with email {patient_email} not found.")
            return False
            
        # Update patient record
        patients = read_patient_db()
        updated = False
        
        for i, p in enumerate(patients):
            if p.get('email') == patient_email:
                # Initialize purchased_medicines list if it doesn't exist
                if 'purchased_medicines' not in p:
                    patients[i]['purchased_medicines'] = []
                    
                # Add the new purchase
                purchase_record = {
                    'name': medicine.get('name'),
                    'quantity': quantity,
                    'price_per_unit': medicine.get('price', 0),
                    'total_cost': quantity * medicine.get('price', 0),
                    'purchase_date': datetime.datetime.now().strftime("%Y-%m-%d"),
                    'category': medicine.get('category')
                }
                
                patients[i]['purchased_medicines'].append(purchase_record)
                updated = True
                break
                
        if not updated:
            print(f"Error: Could not update patient record for {patient_email}.")
            # Rollback medicine quantity change
            update_medicine_quantity(medicine_name, quantity)
            return False
            
        # Save the updated patient data
        if write_patient_db(patients):
            return True
        else:
            print("Error writing to patient database.")
            # Rollback medicine quantity change
            update_medicine_quantity(medicine_name, quantity)
            return False
            
    except Exception as e:
        print(f"Error processing medicine purchase: {str(e)}")
        return False

def get_medicine_quantity(medicine_name: str) -> int:
    """
    Get the current quantity of a medicine.
    
    Args:
        medicine_name (str): The name of the medicine.
        
    Returns:
        int: The current quantity of the medicine, or 0 if not found.
    """
    medicine = find_medicine_by_name(medicine_name)
    if medicine:
        return medicine.get('quantity', 0)
    return 0

def get_patient_purchased_medicines(patient_email: str) -> List[Dict]:
    """
    Get all purchased medicines for a specific patient.
    
    Args:
        patient_email (str): The email of the patient.
        
    Returns:
        List[Dict]: A list of medicines purchased by the patient.
    """
    from .database_utils import get_patient_by_email
    
    try:
        patient = get_patient_by_email(patient_email)
        if not patient:
            print(f"Error: Patient with email {patient_email} not found.")
            return []
        
        return patient.get('purchased_medicines', [])
    except Exception as e:
        print(f"Error getting patient purchased medicines: {str(e)}")
        return []

def get_medicines_by_symptom(symptom: str) -> List[Dict]:
    """
    Get all medicines that address a specific symptom.
    
    Args:
        symptom (str): The symptom to search for.
        
    Returns:
        List[Dict]: A list of medicines that address the specified symptom.
    """
    medicines = load_medicines()
    results = []
    symptom_lower = symptom.lower().strip()
    
    for medicine in medicines:
        if "symptoms" in medicine:
            # Check if symptom is in the symptoms list
            if any(symptom_lower in s.lower() for s in medicine.get("symptoms", [])):
                results.append(medicine)
    
    return results

def record_medicine_inquiry(patient_email: str, medicine_name: str, quantity_needed: int) -> bool:
    """
    Record a patient's inquiry about medicine quantity needed without processing actual purchase.
    This is a placeholder function that just records the patient's interest in a medicine.
    
    Args:
        patient_email (str): The email of the patient making the inquiry.
        medicine_name (str): The name of the medicine the patient is interested in.
        quantity_needed (int): The quantity the patient indicates they need.
        
    Returns:
        bool: True if the inquiry was successfully recorded, False otherwise.
    """
    from .database_utils import read_patient_db, write_patient_db, get_patient_by_email
    
    try:
        # Check if medicine exists
        medicine = find_medicine_by_name(medicine_name)
        if not medicine:
            print(f"Error: Medicine with name {medicine_name} not found.")
            return False
            
        # Get the patient
        patient = get_patient_by_email(patient_email)
        if not patient:
            print(f"Error: Patient with email {patient_email} not found.")
            return False
            
        # Update patient record
        patients = read_patient_db()
        updated = False
        
        for i, p in enumerate(patients):
            if p.get('email') == patient_email:
                # Initialize medicine_inquiries list if it doesn't exist
                if 'medicine_inquiries' not in p:
                    patients[i]['medicine_inquiries'] = []
                    
                # Check if patient already has an inquiry for this medicine
                inquiry_found = False
                for j, inquiry in enumerate(patients[i].get('medicine_inquiries', [])):
                    if inquiry.get('name') == medicine_name:
                        inquiry_found = True
                        patients[i]['medicine_inquiries'][j]['quantity_needed'] = quantity_needed
                        patients[i]['medicine_inquiries'][j]['last_inquiry_date'] = datetime.datetime.now().strftime("%Y-%m-%d")
                        break
                        
                # If medicine not found, add it to the list
                if not inquiry_found:
                    patients[i]['medicine_inquiries'].append({
                        'name': medicine.get('name'),
                        'quantity_needed': quantity_needed,
                        'inquiry_date': datetime.datetime.now().strftime("%Y-%m-%d"),
                        'last_inquiry_date': datetime.datetime.now().strftime("%Y-%m-%d"),
                        'category': medicine.get('category')
                    })
                
                updated = True
                break
                
        if not updated:
            print(f"Error: Could not update patient record for {patient_email}.")
            return False
            
        # Save the updated patient data
        if write_patient_db(patients):
            return True
        else:
            print("Error writing to patient database.")
            return False
            
    except Exception as e:
        print(f"Error recording medicine inquiry: {str(e)}")
        return False

def get_patient_medicine_inquiries(patient_email: str) -> List[Dict]:
    """
    Get all medicine inquiries for a specific patient.
    
    Args:
        patient_email (str): The email of the patient.
        
    Returns:
        List[Dict]: A list of medicine inquiries made by the patient.
    """
    from .database_utils import get_patient_by_email
    
    try:
        patient = get_patient_by_email(patient_email)
        if not patient:
            print(f"Error: Patient with email {patient_email} not found.")
            return []
        
        return patient.get('medicine_inquiries', [])
    except Exception as e:
        print(f"Error getting patient medicine inquiries: {str(e)}")
        return []

def get_medications_counter(patient_email: str) -> Dict:
    """
    Get a summary count of all medicine inquiries and purchases for a patient.
    
    Args:
        patient_email (str): The email of the patient.
        
    Returns:
        Dict: A dictionary containing various medicine statistics for the patient.
    """
    from .database_utils import get_patient_by_email
    
    try:
        patient = get_patient_by_email(patient_email)
        if not patient:
            print(f"Error: Patient with email {patient_email} not found.")
            return {
                "inquiries_count": 0,
                "purchased_count": 0,
                "total_items": 0,
                "recent_inquiries": []
            }
        
        # Get medicine inquiries
        inquiries = patient.get('medicine_inquiries', [])
        
        # Get purchased medicines
        purchased = patient.get('purchased_medicines', [])
        
        # Calculate total quantities
        total_inquiries_quantity = sum(inquiry.get('quantity_needed', 0) for inquiry in inquiries)
        total_purchased_quantity = sum(purchase.get('quantity', 0) for purchase in purchased)
        
        # Get recent inquiries (up to 3)
        recent_inquiries = sorted(
            inquiries, 
            key=lambda x: x.get('last_inquiry_date', ''),
            reverse=True
        )[:3]
        
        # Format recent inquiries for display
        recent_inquiries_display = []
        for inquiry in recent_inquiries:
            recent_inquiries_display.append({
                "name": inquiry.get('name', ''),
                "quantity": inquiry.get('quantity_needed', 0),
                "date": inquiry.get('last_inquiry_date', '')
            })
        
        return {
            "inquiries_count": len(inquiries),
            "inquiries_total_quantity": total_inquiries_quantity,
            "purchased_count": len(purchased),
            "purchased_total_quantity": total_purchased_quantity,
            "total_items": len(inquiries) + len(purchased),
            "recent_inquiries": recent_inquiries_display
        }
    except Exception as e:
        print(f"Error getting medications counter: {str(e)}")
        return {
            "inquiries_count": 0,
            "purchased_count": 0,
            "total_items": 0,
            "recent_inquiries": []
        }

class MedicineTool:
    """
    A class to handle medicine-related operations.
    """
    
    @staticmethod
    def get_medicines_tool(*, category: str = "", search_query: str = ""):
        """
        Get medicines based on category or search query.
        
        Args:
            category (str): The category to filter by. Defaults to empty string.
            search_query (str): The search query to filter by. Defaults to empty string.
            
        Returns:
            List[Dict]: A list of medicines matching the criteria.
        """
        if category and category.strip():
            return get_medicines_by_category(category)
        elif search_query and search_query.strip():
            return search_medicines(search_query)
        else:
            return load_medicines()
    
    @staticmethod
    def prescribe_medication_tool(patient_email: str, medication_name: str, prescription_details: str, doctor_name: str):
        """
        Prescribe a medication to a patient.
        
        Args:
            patient_email (str): The email of the patient.
            medication_name (str): The name of the medication to prescribe.
            prescription_details (str): Details about the prescription (dosage, frequency, etc.).
            doctor_name (str): The name of the doctor prescribing the medication.
            
        Returns:
            str: A message indicating the result of the prescription.
        """
        medicine = get_medicine_by_name(medication_name)
        if not medicine:
            return f"Error: Medication '{medication_name}' not found."
        
        success = add_patient_medication(
            patient_email=patient_email,
            medication_name=medication_name,
            prescription_details=prescription_details,
            prescribed_by=doctor_name
        )
        
        if success:
            return f"Successfully prescribed {medicine['name']} to patient with email {patient_email}."
        else:
            return f"Failed to prescribe medication. Please check patient email and try again."
    
    @staticmethod
    def get_patient_medications_tool(patient_email: str):
        """
        Get all medications for a specific patient.
        
        Args:
            patient_email (str): The email of the patient.
            
        Returns:
            List[Dict]: A list of medications prescribed to the patient.
        """
        return get_patient_medications(patient_email)
    
    @staticmethod
    def update_medication_status_tool(patient_email: str, medication_name: str, active: bool):
        """
        Update the status of a patient's medication (active/inactive).
        
        Args:
            patient_email (str): The email of the patient.
            medication_name (str): The name of the medication to update.
            active (bool): Whether the medication is active or not.
            
        Returns:
            str: A message indicating the result of the status update.
        """
        success = update_patient_medication_status(
            patient_email=patient_email,
            medication_name=medication_name,
            active=active
        )
        
        status_text = "active" if active else "inactive"
        
        if success:
            return f"Successfully updated medication status to {status_text}."
        else:
            return f"Failed to update medication status. Please check patient email and medication name."
    
    @staticmethod
    def purchase_medicine_tool(patient_email: str, medicine_name: str, quantity: int):
        """
        Purchase a medicine for a patient.
        
        Args:
            patient_email (str): The email of the patient making the purchase.
            medicine_name (str): The name of the medicine to purchase.
            quantity (int): The quantity to purchase.
            
        Returns:
            bool: True if the purchase was successful, False otherwise.
        """
        return purchase_medicine(patient_email, medicine_name, quantity)
    
    @staticmethod
    def get_patient_purchased_medicines_tool(patient_email: str):
        """
        Get all purchased medicines for a specific patient.
        
        Args:
            patient_email (str): The email of the patient.
            
        Returns:
            List[Dict]: A list of medicines purchased by the patient.
        """
        return get_patient_purchased_medicines(patient_email)
    
    @staticmethod
    def get_medicine_quantity_tool(medicine_name: str):
        """
        Get the current quantity of a medicine.
        
        Args:
            medicine_name (str): The name of the medicine.
            
        Returns:
            int: The current quantity of the medicine, or 0 if not found.
        """
        return get_medicine_quantity(medicine_name)
    
    @staticmethod
    def get_medicines_by_symptom_tool(symptom: str):
        """
        Get all medicines that address a specific symptom.
        
        Args:
            symptom (str): The symptom to search for.
            
        Returns:
            List[Dict]: A list of medicines that address the specified symptom.
        """
        return get_medicines_by_symptom(symptom)
    
    @staticmethod
    def record_medicine_inquiry_tool(patient_email: str, medicine_name: str, quantity_needed: int):
        """
        Record a patient's inquiry about medicine quantity needed without processing actual purchase.
        
        Args:
            patient_email (str): The email of the patient making the inquiry.
            medicine_name (str): The name of the medicine the patient is interested in.
            quantity_needed (int): The quantity the patient indicates they need.
            
        Returns:
            bool: True if the inquiry was successfully recorded, False otherwise.
        """
        return record_medicine_inquiry(patient_email, medicine_name, quantity_needed)
    
    @staticmethod
    def get_patient_medicine_inquiries_tool(patient_email: str):
        """
        Get all medicine inquiries for a specific patient.
        
        Args:
            patient_email (str): The email of the patient.
            
        Returns:
            List[Dict]: A list of medicine inquiries made by the patient.
        """
        return get_patient_medicine_inquiries(patient_email)
    
    @staticmethod
    def get_medications_counter_tool(patient_email: str):
        """
        Get a summary count of all medicine inquiries and purchases for a patient.
        
        Args:
            patient_email (str): The email of the patient.
            
        Returns:
            Dict: A dictionary containing various medicine statistics for the patient.
        """
        return get_medications_counter(patient_email) 