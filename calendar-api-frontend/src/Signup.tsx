import { useState } from 'react';
import Swal from 'sweetalert2'

interface SignupProps {
  switchToLogin: () => void;
}

const Signup = ({ switchToLogin }: SignupProps) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const response = await fetch('http://localhost:3001/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });
  
      if (response.ok) {
        const data = await response.json();
        console.log('Signup successful:', data);
        Swal.fire({
            title: "Success!",
            text: "Your account was created",
            icon: "success"
          }).then((result) => {
            if (result.isConfirmed) {
                switchToLogin();
            }
          })
        // Handle successful signup (e.g., redirect to login)
      } else {
        const error = await response.json();
        console.error('Signup failed:', error);
        // Handle signup failure (e.g., display error message)
      }
    console.log('Signup:', { name, email, password });
  };

  return (
    <div>
      <h2>Signup</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Name:</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Signup</button>
      </form>
      <p>
        Already have an account? <button onClick={switchToLogin}>Log in</button>
      </p>
    </div>
  );
};

export default Signup;
