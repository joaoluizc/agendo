const GoogleAppAuth = () => {
    const signIn = () => {
        const token = localStorage.getItem('token');
        fetch('api/gcalendar/login', {
            method: 'GET',
            headers: {
                'authorization': `${token}`
            }
        }).then(response => {
            if (response.status === 200) {
                response.json().then(data => {
                    if (data.ssoUrl) {
                        window.location.href = data.ssoUrl;
                    }
                });
            } else {
                console.log('Failed to sign in');
            }
        });
    };

    return (
        <button onClick={signIn}>Sign in with Google</button>
    );
}

export default GoogleAppAuth;