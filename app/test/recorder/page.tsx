'use client'

export default function RecorderTestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">ConsentVault Recorder Test</h1>
      
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-800 mb-2">
          This page has the ConsentVault recorder script installed. Check the browser console for recorder initialization.
        </p>
        <p className="text-sm text-gray-600">
          The recorder should:
        </p>
        <ul className="list-disc list-inside text-sm text-gray-600 mt-2">
          <li>Initialize a session on page load</li>
          <li>Start recording page interactions</li>
          <li>Send event batches every 5 seconds</li>
          <li>Finalize on form submit or page unload</li>
        </ul>
      </div>

      <form
        className="space-y-4 max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          alert('Form submitted! Check the database for the finalized session.')
        }}
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            placeholder="test@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
        >
          Submit Form
        </button>
      </form>

      <script
        src={`/recorder.js`}
        data-site-key="test-site-12345"
        async
      />
    </div>
  )
}
